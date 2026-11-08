import type React from "react";
import { View, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import Alert from "@/utilities/alertPolyfill";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import InterRegular from "../Text/InterRegular";
import { useApi } from "@/contexts/ApiContext";

/** Matches the slot cap the UI renders. */
const MAX_PHOTOS = 10;

/** A short human label for an asset, for error messages. */
const file_label = (asset: ImagePicker.ImagePickerAsset, i: number): string =>
  asset.fileName || `photo ${i + 1}`;

interface PhotoUploadProps {
  onPhotosChange: (photos: string[]) => void;
  photos: string[];
  onUploadStarted?: (started: boolean) => void;
}

const PhotoUpload: React.FC<PhotoUploadProps> = ({
  onPhotosChange,
  photos,
  onUploadStarted,
}) => {
  const { uploadFile } = useApi();
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  // Progress across a multi-image selection. Null when idle.
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);

  const convertImageToFile = (asset: ImagePicker.ImagePickerAsset): any => {
    const filename = asset.uri.split("/").pop() || "photo.jpg";
    const type = asset.mimeType || "image/jpeg";
    
    // For Expo, return object with uri, type, name for FormData
    console.log("🔄 Converting asset to file object:", { uri: asset.uri, type, filename });
    
    return {
      uri: asset.uri,
      name: filename,
      type: type,
    };
  };

  /** Pulls a usable file URL out of the several shapes the API returns. */
  const extractFileUrl = (uploaded: any): string | undefined => {
    if (typeof uploaded === "string") return uploaded;
    return uploaded?.file_url ?? uploaded?.data?.file_url;
  };

  /**
   * Opens the gallery and uploads what comes back.
   *
   * Multi-select is enabled whenever the user is ADDING photos, which is the
   * common case for a listing — picking eight photos one at a time, waiting for
   * each upload in between, was the slowest possible way to do the most normal
   * thing. Replacing one existing slot stays single-select, because "replace
   * this one photo" has no sensible meaning for a selection of five.
   */
  const pickImage = async (slotIndex?: number) => {
    const isReplacing = slotIndex !== undefined && slotIndex < photos.length;
    const remaining = MAX_PHOTOS - photos.length;

    if (!isReplacing && remaining <= 0) {
      Alert.alert("Photo limit reached", `You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false, // Allow full size image upload
        quality: 0.9,
        allowsMultipleSelection: !isReplacing,
        // Caps the picker itself, so the user cannot choose twelve photos and
        // then be told afterwards that only three were kept.
        selectionLimit: isReplacing ? 1 : remaining,
      });

      if (result.canceled || !result.assets?.length) return;

      const assets = isReplacing ? result.assets.slice(0, 1) : result.assets;

      if (isReplacing) setUploadingIndex(slotIndex);
      else setBatch({ done: 0, total: assets.length });
      onUploadStarted?.(true);

      // Sequential rather than parallel: photo order is meaningful (the first
      // is the listing's cover), and firing ten concurrent uploads at the
      // backend is a good way to get several of them rejected.
      const uploaded: string[] = [];
      const failures: string[] = [];

      for (let i = 0; i < assets.length; i++) {
        try {
          const file = convertImageToFile(assets[i]);
          const response: any = await uploadFile("property", file);
          const fileUrl = extractFileUrl(response);
          if (!fileUrl) throw new Error("No file URL returned from server");
          uploaded.push(fileUrl);
        } catch (err: any) {
          console.error(`Image ${i + 1} failed to upload:`, err);
          failures.push(file_label(assets[i], i));
        } finally {
          if (!isReplacing) setBatch({ done: i + 1, total: assets.length });
        }
      }

      // Whatever succeeded is kept. Discarding six good uploads because the
      // seventh failed would make the user redo all of them.
      if (uploaded.length) {
        if (isReplacing) {
          const next = [...photos];
          next[slotIndex!] = uploaded[0];
          onPhotosChange(next);
        } else {
          onPhotosChange([...photos, ...uploaded].slice(0, MAX_PHOTOS));
        }
      }

      if (failures.length) {
        Alert.alert(
          uploaded.length ? "Some photos didn't upload" : "Upload failed",
          uploaded.length
            ? `${uploaded.length} uploaded. These didn't: ${failures.join(", ")}. You can add them again.`
            : "None of the photos could be uploaded. Please check your connection and try again."
        );
      }
    } catch (error: any) {
      console.error("Image upload error:", error);
      Alert.alert(
        "Upload Error",
        error?.message || "Failed to upload image. Please try again."
      );
    } finally {
      setUploadingIndex(null);
      setBatch(null);
      onUploadStarted?.(false);
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
  };

  const renderPhotoSlot = (index: number) => {
    const hasPhoto = photos[index];
    const isUploading = uploadingIndex === index;

    return (
      <View key={index} style={{ width: "48%", aspectRatio: 1, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() => pickImage(index)}
          disabled={isUploading || batch !== null}
          className="w-full h-full bg-gray-100 rounded-lg justify-center items-center border border-borderColor overflow-hidden"
        >
          {isUploading ? (
            <View className="justify-center items-center">
              <ActivityIndicator size="small" color="#C1272D" />
              <InterRegular className="text-xs text-secondaryText mt-2">Uploading...</InterRegular>
            </View>
          ) : hasPhoto ? (
            <Image
              source={{ uri: hasPhoto }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <View className="justify-center items-center">
              <InterRegular className="text-primary text-2xl">+</InterRegular>
            </View>
          )}
        </TouchableOpacity>
        {hasPhoto && !isUploading && (
          <TouchableOpacity
            onPress={() => removePhoto(index)}
            className="absolute -top-2 -right-2 bg-red-500 rounded-full w-6 h-6 justify-center items-center z-10"
          >
            <InterRegular className="text-white text-xs">✕</InterRegular>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Create an array of indices to render
  // We want to show all photos, plus enough empty slots to have at least 4 total
  const slotsToRender = Math.max(4, photos.length + (photos.length < 10 ? 1 : 0));
  const indices = Array.from({ length: slotsToRender }, (_, i) => i);

  return (
    <View>
      <InterRegular className="text-base mb-1">
        Add at least 4 photos
      </InterRegular>
      {/* Says the picker is multi-select up front — people do not discover it
          by guessing, and picking one at a time is the slow path we just
          removed. */}
      <InterRegular className="text-xs text-secondaryText mb-4">
        You can select several at once (up to {MAX_PHOTOS}).
      </InterRegular>

      {batch && (
        <View className="flex-row items-center mb-3">
          <ActivityIndicator size="small" color="#C1272D" />
          <InterRegular className="text-sm text-secondaryText ml-2">
            Uploading {batch.done} of {batch.total}…
          </InterRegular>
        </View>
      )}
      <View className="flex-row flex-wrap justify-between">
        {indices.map(renderPhotoSlot)}
      </View>

      {photos.length >= 4 && photos.length < 10 && (
        <TouchableOpacity
          onPress={() => pickImage()}
          disabled={uploadingIndex !== null || batch !== null}
          className="flex-row items-center mt-2 mb-10"
        >
          <InterRegular className="text-base mr-2">Add more photos</InterRegular>
          <InterRegular className="text-primary text-xl">+</InterRegular>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default PhotoUpload;

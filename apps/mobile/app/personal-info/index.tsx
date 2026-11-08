import {
  View,
  Text,
  SafeAreaView,
  Image,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import BackBtn from "@/components/common/BackBtn";
import Button from "@/components/common/Button";
import InterSemiBold from "@/components/Text/InterSemiBold";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import Icon from "@/components/common/Icon";
import { PENCIL } from "@/assets/icons";
import StyledTextInput from "@/components/input/textInput";
import InterRegular from "@/components/Text/InterRegular";
import SelectInput from "@/components/input/selectInput";
import { SelectOption } from "@/components/input/selectInput/type";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import { router } from "expo-router";
import FeedbackModal from "@/components/common/FeedbackModal";
import AuthGuard from "@/components/AuthGuard";
import { allNigeriaLocations } from "@/constants/locations";
import LocationPicker from "@/components/input/LocationPicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import getFullImageUrl from "@/utilities/imageUrl";

const PersonalInfo = () => {
  const { user, getMe, updateMe, uploadFile, isLoading, error } = useApi();
  const { isSeller } = useMode();
  const [selectedLocation, setSelectedLocation] = useState<string>(
    "User profile location"
  );
  const [profileImg, setProfileImg] = useState("");
  const [fullName, setFullName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Modal state
  const [modalConfig, setModalConfig] = useState<{
    isVisible: boolean;
    type: "success" | "error" | "info" | "loading";
    title: string;
    message?: string;
  }>({
    isVisible: false,
    type: "info",
    title: "",
  });

  const showModal = (
    type: "success" | "error" | "info" | "loading",
    title: string,
    message?: string
  ) => {
    setModalConfig({ isVisible: true, type, title, message });
  };

  const hideModal = () => {
    setModalConfig((prev) => ({ ...prev, isVisible: false }));
  };

  // Always fetch fresh user data on mount to ensure form shows current values
  useEffect(() => {
    console.log("🔄 PersonalInfo: Fetching fresh user data on mount");
    getMe({ silent: true }).catch(() => { });
  }, [getMe]);

  // Update form fields when user data loads
  useEffect(() => {
    if (user) {
      console.log("📋 PersonalInfo: Populating form from user:", {
        id: user.id,
        fullname: user.fullname,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        location: user.location,
        agency_name: user.agency_name,
      });
      setFullName(user.fullname || "");
      setAgencyName(user.agency_name || "");
      setPhoneNumber(user.phone_number || "");
      setEmail(user.email || "");
      setSelectedLocation(user.location || "User profile location");
      // Store the raw API path — getFullImageUrl is used only for display
      setProfileImg(user.avatar_url || "");
    }
  }, [user]);

  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: true,
        aspect: [1, 1], // Better for profile pictures
        quality: 0.8,   // Compress slightly for faster upload
      });

      console.log(result);

      if (!result.canceled) {
        showModal("loading", "Uploading Image", "Please wait while we upload your profile picture...");
        // Upload the image to the server
        const uploadedFile = await uploadFile("profile", result.assets[0]);
        // Cache-bust the URL so the Image component re-fetches immediately
        const cacheBustedUrl = uploadedFile.file_url.includes("?t=")
          ? uploadedFile.file_url
          : `${uploadedFile.file_url}?t=${Date.now()}`;
        setProfileImg(cacheBustedUrl);
        hideModal();
      }
    } catch (error) {
      showModal("error", "Upload Failed", "Failed to upload image. Please try again.");
    }
  };

  const handleSaveChanges = async () => {
    if (!user) return;

    // Strict validation for phone number format: ^\+\d{10,15}$
    let formattedPhone = phoneNumber.trim();

    if (formattedPhone) {
      // If it doesn't start with +, and it's just numbers, prepend +
      if (!formattedPhone.startsWith("+")) {
        const numericOnly = formattedPhone.replace(/\D/g, "");
        formattedPhone = `+${numericOnly}`;
      } else {
        const numericPart = formattedPhone.slice(1).replace(/\D/g, "");
        formattedPhone = `+${numericPart}`;
      }

      if (formattedPhone.length < 11 || formattedPhone.length > 16) {
        showModal(
          "error",
          "Invalid Phone Number",
          "Phone number must include country code and be between 10 to 15 digits (e.g., +23480...)"
        );
        return;
      }
    }

    setIsSaving(true);
    showModal("loading", "Saving Changes", "We're updating your profile info...");

    try {
      const updateData: any = {
        fullname: fullName,
        phone_number: formattedPhone,
        email: email,
        location: selectedLocation,
        account_type: user.account_type || "client",
      };

      // Always include agency_name in seller mode (even empty to allow clearing)
      // Skip entirely in buyer mode so it doesn't overwrite seller data
      if (isSeller) {
        updateData.agency_name = agencyName.trim();
      }

      if (profileImg) {
        updateData.avatar_url = profileImg;
      }

      await updateMe(updateData);

      // Purge the agent cache for the current user so other views
      // (details page, chat header, ProfileVisibilityCard) show fresh data
      if (user?.id) {
        try {
          await AsyncStorage.removeItem(`agent_cache_${user.id}`);
          console.log(`🗑️ Cleared agent cache for user ${user.id}`);
        } catch { /* non-critical */ }
      }

      showModal("success", "Profile Updated", "Your changes have been saved successfully!");
      // Wait a moment so the user sees the success modal before going back
      setTimeout(() => {
        hideModal();
        router.back();
      }, 2000);
    } catch (err: any) {
      showModal("error", "Update Failed", err?.message || "Failed to update profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthGuard>
      <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
        <FeedbackModal
          isVisible={modalConfig.isVisible}
          type={modalConfig.type}
          title={modalConfig.title}
          message={modalConfig.message}
          onClose={modalConfig.type !== "loading" ? hideModal : undefined}
        />
        <View
          className="container flex-1 mx-auto max-w-2xl"
          style={{ padding: 20 }}
        >
          <View className="flex-row items-center gap-4">
            <BackBtn />
            <InterSemiBold className="text-lg/5">Profile Info</InterSemiBold>
          </View>

          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <View className="mt-5">
              {/* profile image section */}
              <View className="flex-row items-center justify-center gap-4">
                <View className="relative w-28 h-28">
                  <View
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: 50,
                      overflow: "hidden",
                      borderWidth: 2,
                      borderColor: "#E5E7EB",
                      backgroundColor: "#DC2626",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {profileImg ? (
                      <Image
                        source={{ uri: getFullImageUrl(profileImg) }}
                        key={profileImg || "default-avatar"}
                        style={{ width: 100, height: 100 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <InterSemiBold style={{ color: "#fff", fontSize: 36 }}>
                        {(user?.fullname || user?.username || "U").charAt(0).toUpperCase()}
                      </InterSemiBold>
                    )}
                  </View>
                  <TouchableOpacity
                    className="rounded-full bg-primary p-4 absolute right-0 m-0 bottom-0 "
                    onPress={pickImage}
                  >
                    <View pointerEvents="none">
                      <Icon icon={PENCIL} width={16} height={16} className="" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* the profile input section */}

              <View>
                <View className="mb-3">
                  <InterRegular className="text-sm/[150%] mb-1">
                    Full Name
                  </InterRegular>
                  <StyledTextInput
                    placeholder="Enter your full name"
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>
                {/* Agency Name — only visible in Seller/Agent mode */}
                {isSeller && (
                  <View className="mb-3">
                    <InterRegular className="text-sm/[150%] mb-1">
                      Agency Name (optional)
                    </InterRegular>
                    <StyledTextInput
                      placeholder="Enter agency name (if any)"
                      value={agencyName}
                      onChangeText={setAgencyName}
                    />
                  </View>
                )}
                <View className="mb-3">
                  <InterRegular className="text-sm/[150%] mb-1">
                    Phone number
                  </InterRegular>
                  <StyledTextInput
                    placeholder="Enter phone number"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                  />
                </View>
                <View className="mb-3">
                  <InterRegular className="text-sm/[150%] mb-1">
                    Email
                  </InterRegular>
                  <StyledTextInput
                    placeholder="Enter email address"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View className="mb-3">
                  <LocationPicker
                    label="Location"
                    value={selectedLocation}
                    onValueChange={(value) =>
                      setSelectedLocation(value as string)
                    }
                    placeholder="Search or type your location"
                  />
                </View>

                <View className="mb-3">
                  <InterRegular className="text-sm/[150%] mb-1">
                    KYC status
                  </InterRegular>
                  <StyledTextInput
                    placeholder={user?.kyc_status || "Pending verification"}
                    editable={false}
                  />
                </View>

                {/* Save change button */}
                <View>
                  <Button
                    className="rounded-xl"
                    onPress={handleSaveChanges}
                    disabled={isSaving}
                  >
                    <InterSemiBold className="text-white">
                      {isSaving ? "Saving..." : "Save Changes"}
                    </InterSemiBold>
                  </Button>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </AuthGuard>
  );
};

export default PersonalInfo;

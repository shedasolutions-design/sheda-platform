import React, { useEffect } from "react";
import { Modal, View, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator } from "react-native";
import { CheckCircle2, XCircle, AlertCircle, AlertTriangle, RefreshCw } from "lucide-react-native";
import InterSemiBold from "../Text/InterSemiBold";
import InterRegular from "../Text/InterRegular";
import Button from "./Button";
import { getUserFriendlyError } from "@/utilities/errorUtils";

interface FeedbackModalProps {
  isVisible: boolean;
  type: "success" | "error" | "info" | "loading" | "warning";
  title: string;
  message?: string;
  onClose?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  actionColor?: string;
  autoCloseOnSuccess?: boolean;
  autoCloseDuration?: number;
  retryAction?: () => void;
  showRetry?: boolean;
}

const { width } = Dimensions.get("window");

const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isVisible,
  type,
  title,
  message,
  onClose,
  actionLabel,
  onAction,
  actionColor,
  autoCloseOnSuccess = false,
  autoCloseDuration = 2000,
  retryAction,
  showRetry = false,
}) => {
  // Auto-close on success if enabled
  useEffect(() => {
    if (isVisible && type === 'success' && autoCloseOnSuccess && onClose) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDuration);

      return () => clearTimeout(timer);
    }
  }, [isVisible, type, autoCloseOnSuccess, autoCloseDuration, onClose]);

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle2 size={64} color="#10B981" />;
      case "error":
        return <XCircle size={64} color="#EF4444" />;
      case "info":
        return <AlertCircle size={64} color="#3B82F6" />;
      case "warning":
        return <AlertTriangle size={64} color="#F59E0B" />;
      case "loading":
        return <ActivityIndicator size="large" color="#2152FF" />;
    }
  };

  // Make error messages user-friendly
  const displayMessage = type === 'error' && message ? getUserFriendlyError(message) : message;

  return (
    <Modal
      transparent
      visible={isVisible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>{getIcon()}</View>
          <InterSemiBold className="text-xl text-center mt-4 text-primaryText">
            {title}
          </InterSemiBold>
          {displayMessage && (
            <InterRegular className="text-sm text-center mt-2 text-secondaryText px-4">
              {displayMessage}
            </InterRegular>
          )}

          {type !== "loading" && (
            <View className="w-full mt-8 gap-3">
              {/* Retry button for errors */}
              {type === "error" && showRetry && retryAction && (
                <Button 
                  onPress={retryAction} 
                  className="rounded-xl w-full flex-row items-center justify-center gap-2"
                  color={actionColor}
                >
                  <RefreshCw size={18} color="white" />
                  <InterSemiBold className="text-white">Try Again</InterSemiBold>
                </Button>
              )}
              
              {/* Custom action button */}
              {onAction && actionLabel && (
                <Button 
                  onPress={onAction} 
                  className="rounded-xl w-full"
                  color={actionColor}
                >
                  <InterSemiBold className="text-white">{actionLabel}</InterSemiBold>
                </Button>
              )}
              
              {/* Close button */}
              {onClose && (
                <TouchableOpacity
                  onPress={onClose}
                  className="w-full py-3 items-center"
                >
                  <InterRegular className="text-primary">
                    {onAction || (showRetry && retryAction) ? "Cancel" : "Close"}
                  </InterRegular>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
    width: width * 0.85,
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  iconContainer: {
    marginBottom: 10,
  },
});

export default FeedbackModal;

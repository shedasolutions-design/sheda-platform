import { View, TouchableOpacity } from "react-native";
import InterSemiBold from "../Text/InterSemiBold";
import InterRegular from "../Text/InterRegular";
import InterMedium from "../Text/InterMedium";
import { 
  AlertCircle, 
  RefreshCw, 
  WifiOff, 
  ServerCrash, 
  SearchX, 
  Lock,
  MessageCircle 
} from "lucide-react-native";
import { categorizeError, getUserFriendlyError } from "@/utilities/errorUtils";

export type ErrorType = 'network' | 'auth' | 'notFound' | 'server' | 'generic';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  type?: ErrorType;
  showSupport?: boolean;
  onContactSupport?: () => void;
}

const ErrorState = ({ 
  message, 
  onRetry, 
  type,
  showSupport = false,
  onContactSupport 
}: ErrorStateProps) => {
  // Auto-detect error type if not provided
  const errorCategory = type || categorizeError(message).category;
  const userFriendlyMessage = getUserFriendlyError(message);

  const getIconAndColor = () => {
    switch (errorCategory) {
      case 'network':
        return { 
          Icon: WifiOff, 
          color: "#F59E0B", 
          bgColor: "bg-amber-50", 
          borderColor: "border-amber-100",
          title: "Connection Error"
        };
      case 'auth':
        return { 
          Icon: Lock, 
          color: "#EF4444", 
          bgColor: "bg-red-50", 
          borderColor: "border-red-100",
          title: "Authentication Required"
        };
      case 'notFound':
        return { 
          Icon: SearchX, 
          color: "#6B7280", 
          bgColor: "bg-gray-50", 
          borderColor: "border-gray-100",
          title: "Not Found"
        };
      case 'server':
        return { 
          Icon: ServerCrash, 
          color: "#8B5CF6", 
          bgColor: "bg-purple-50", 
          borderColor: "border-purple-100",
          title: "Server Error"
        };
      default:
        return { 
          Icon: AlertCircle, 
          color: "#ef4444", 
          bgColor: "bg-red-50", 
          borderColor: "border-red-100",
          title: "Something Went Wrong"
        };
    }
  };

  const { Icon, color, bgColor, borderColor, title } = getIconAndColor();

  return (
    <View className="flex-1 items-center justify-center px-8 py-20">
      <View className={`w-24 h-24 ${bgColor} rounded-full items-center justify-center mb-6 border ${borderColor} shadow-sm`}>
        <Icon size={40} color={color} strokeWidth={1.5} />
      </View>
      
      <InterSemiBold className="text-2xl text-primaryText text-center mb-3">
        {title}
      </InterSemiBold>
      
      <InterRegular className="text-center text-secondaryText mb-10 max-w-[280px] text-base leading-6">
        {userFriendlyMessage}
      </InterRegular>

      <View className="w-full max-w-[280px] gap-3">
        <TouchableOpacity
          onPress={onRetry}
          activeOpacity={0.7}
          className="flex-row items-center justify-center gap-3 bg-primary px-8 py-4 rounded-2xl shadow-md active:shadow-sm"
        >
          <RefreshCw size={20} color="white" />
          <InterMedium className="text-white text-base">Try Again</InterMedium>
        </TouchableOpacity>

        {showSupport && onContactSupport && (
          <TouchableOpacity
            onPress={onContactSupport}
            activeOpacity={0.7}
            className="flex-row items-center justify-center gap-3 bg-gray-100 px-8 py-4 rounded-2xl active:bg-gray-200"
          >
            <MessageCircle size={20} color="#374151" />
            <InterMedium className="text-gray-700 text-base">Contact Support</InterMedium>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default ErrorState;

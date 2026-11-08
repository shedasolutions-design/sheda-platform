import { View, TouchableOpacity } from "react-native";
import InterSemiBold from "../Text/InterSemiBold";
import InterRegular from "../Text/InterRegular";
import InterMedium from "../Text/InterMedium";
import { Search, RefreshCw } from "lucide-react-native";

interface EmptyStateProps {
  onRefresh: () => void;
  title?: string;
  message?: string;
}

const EmptyState = ({
  onRefresh,
  title = "No Properties Found",
  message = "We couldn't find any properties matching your search or category. Try refreshing or changing your filters!",
}: EmptyStateProps) => (
  <View className="flex-1 items-center justify-center px-8 py-20">
    <View className="w-24 h-24 bg-gray-50 rounded-full items-center justify-center mb-6 border border-gray-100 shadow-sm">
      <Search size={40} color="#C1272D" strokeWidth={1.5} />
    </View>
    
    <InterSemiBold className="text-2xl text-gray-900 text-center mb-3">
      {title}
    </InterSemiBold>
    
    <InterRegular className="text-center text-secondaryText mb-10 max-w-[280px] text-base leading-6">
      {message}
    </InterRegular>

    <TouchableOpacity
      onPress={onRefresh}
      activeOpacity={0.7}
      className="flex-row items-center justify-center gap-3 bg-primary px-8 py-4 rounded-2xl shadow-md active:shadow-sm"
    >
      <RefreshCw size={20} color="white" />
      <InterMedium className="text-white text-base">Refresh Listings</InterMedium>
    </TouchableOpacity>
  </View>
);

export default EmptyState;

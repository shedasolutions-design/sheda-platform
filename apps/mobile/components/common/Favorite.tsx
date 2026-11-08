import { TouchableOpacity, View } from "react-native";
import { HEART, FILLEDHEART } from "@/assets/icons";
import Icon from "./Icon";
import { useApi } from "@/contexts/ApiContext";

interface FavoriteProps {
    className?: string;
    propertyId: number;
}

const Favorite = ({ className, propertyId }: FavoriteProps) => {
    const { favorites, toggleFavorite } = useApi();
    const isFavorite = favorites.includes(propertyId);

    const handleFavorite = (e: any) => {
        e.stopPropagation();
        toggleFavorite(propertyId);
    }

    return (
        <TouchableOpacity 
            onPress={handleFavorite} 
            className={`border w-12 h-12 items-center justify-center border-borderColor rounded-xl ${className}`}
        >
            <View pointerEvents="none">
                {isFavorite ? (
                    <Icon
                        icon={FILLEDHEART}
                        width={13}
                        height={12}
                    />
                ) : (
                    <Icon
                        icon={HEART}
                        width={13}
                        height={12}
                    />
                )}
            </View>
        </TouchableOpacity>
    )
}

export default Favorite;
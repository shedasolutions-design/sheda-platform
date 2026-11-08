import React from "react";
import { ScrollView, View, TouchableOpacity } from "react-native";
import { categories } from "@/constants/categories-mock";
import InterRegular from "./Text/InterRegular";
import { useApi } from "@/contexts/ApiContext";
import { MaterialIcons } from "@expo/vector-icons";

const CategoryList = () => {
  const { selectedCategory, setSelectedCategory } = useApi();

  const handleCategoryClick = (name: string) => {
    // Toggle: if already selected, go back to "All"
    if (selectedCategory === name && name !== "All") {
      setSelectedCategory("All");
    } else {
      setSelectedCategory(name);
    }
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex-row mt-2 gap-2">
        {categories?.map((category) => {
          const isSelected = selectedCategory === category.name;
          return (
            <TouchableOpacity
              key={category.id}
              onPress={() => handleCategoryClick(category.name)}
              style={{
                backgroundColor: isSelected ? "#C1272D" : "#C1272D0A",
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderWidth: 1,
                borderColor: isSelected ? "#C1272D" : "#E5E7EB",
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={category.icon as any}
                size={16}
                color={isSelected ? "#FFFFFF" : "#6B7280"}
              />
              <InterRegular
                style={{
                  color: isSelected ? "#FFFFFF" : "#6B7280",
                  fontSize: 13,
                }}
              >
                {category.name}
              </InterRegular>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
};

export default CategoryList;

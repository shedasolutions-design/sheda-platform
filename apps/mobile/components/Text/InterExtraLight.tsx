import React from 'react';
import { Text, TextProps, StyleProp, TextStyle } from 'react-native';

// Define the props interface for InterExtraBold
interface InterExtraLightProps extends TextProps {
  className?: string; // Optional: Tailwind classes
  style?: StyleProp<TextStyle>; // Optional: Custom styles
  children: React.ReactNode; // Text content
}

const InterExtraLight: React.FC<InterExtraLightProps> = ({ style, ...rest }) => {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: 'Inter-ExtraLight' }, style]}
    >
      {rest.children}
    </Text>
  );
};

export default InterExtraLight;
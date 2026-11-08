import React from 'react';
import { Text, TextProps, StyleProp, TextStyle } from 'react-native';

// Define the props interface for InterMedium
interface InterMediumProps extends TextProps {
  className?: string; // Optional: Tailwind classes
  style?: StyleProp<TextStyle>; // Optional: Custom styles
  children: React.ReactNode; // Text content
}

const InterMedium: React.FC<InterMediumProps> = ({ style, ...rest }) => {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: 'Inter-Medium' }, style]}
    >
      {rest.children}
    </Text>
  );
};

export default InterMedium;
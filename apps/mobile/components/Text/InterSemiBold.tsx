import React from 'react';
import { Text, TextProps, StyleProp, TextStyle } from 'react-native';

// Define the props interface for InterSemiBold
interface InterSemiBoldProps extends TextProps {
  className?: string; // Optional: Tailwind classes
  style?: StyleProp<TextStyle>; // Optional: Custom styles
  children: React.ReactNode; // Text content
}

const InterSemiBold: React.FC<InterSemiBoldProps> = ({ style, ...rest }) => {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: 'Inter-SemiBold' }, style]}
    >
      {rest.children}
    </Text>
  );
};

export default InterSemiBold;
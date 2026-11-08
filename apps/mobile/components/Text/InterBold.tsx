import React from 'react';
import { Text, TextProps, StyleProp, TextStyle } from 'react-native';

// Define the props interface for InterBold
interface InterBoldProps extends TextProps {
  className?: string; // Optional: Tailwind classes
  style?: StyleProp<TextStyle>; // Optional: Custom styles
  children: React.ReactNode; // Text content
}

const InterBold: React.FC<InterBoldProps> = ({ style, ...rest }) => {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: 'Inter-Bold' }, style]}
    >
      {rest.children}
    </Text>
  );
};

export default InterBold;
import React from 'react';
import { Text, TextProps, StyleProp, TextStyle } from 'react-native';

interface SoraBoldProps extends TextProps {
  className?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

const SoraBold = ({ style, ...rest }: SoraBoldProps) => {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: 'Sora-Bold' }, style]}
    >
      {rest.children}
    </Text>
  );
};

export default SoraBold;
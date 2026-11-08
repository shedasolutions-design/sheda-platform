import { Text, TextProps, StyleProp, TextStyle } from "react-native";

interface ManropeMediumProps extends TextProps {
  className?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

const ManropeMedium = ({ style, ...rest }: ManropeMediumProps) => {
    return(
        <Text 
        {...rest}
        style={[{fontFamily: 'Manrope-Medium'}, style]}
        >
            {rest.children}
        </Text>
    )
}
export default ManropeMedium;
import { Text as RNText, TextProps } from "react-native";

/**
 * Inter, in the four weights the rental app loads.
 *
 * Same component shape as that app's components/Text/* so a screen written
 * here can be moved across with only the import path changing.
 */
type Props = TextProps & { className?: string };

const make = (fontFamily: string) =>
  function Styled({ style, ...rest }: Props) {
    return <RNText {...rest} style={[{ fontFamily }, style]} />;
  };

export const InterRegular = make("Inter-Regular");
export const InterMedium = make("Inter-Medium");
export const InterSemiBold = make("Inter-SemiBold");
export const InterBold = make("Inter-Bold");

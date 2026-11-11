
type AlertButtonStyle = "default" | "cancel" | "destructive";

interface AlertButton {
  text?: string;
  style?: AlertButtonStyle;
  onPress?: (value?: string) => void | Promise<void>;
  isPreferred?: boolean;
}

/**
 * Drop-in replacement for React Native's `Alert` — react-native-web's
 * Alert.alert is a hardcoded no-op (`class Alert { static alert() {} }`),
 * so on the web build every confirmation dialog gated behind it (accept/
 * reject bid, release payment, cancel bid, ...) silently did nothing: the
 * button's onPress fired, Alert.alert ran, but no dialog ever appeared for
 * the user to confirm, so the actual on-chain action never happened.
 *
 * Same call signature as RN's Alert.alert, so swapping the import is the
 * only change needed at each call site. In the browser it maps to
 * window.alert / window.confirm.
 */
function alert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: unknown
): void {
  const text = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length === 0) {
    window.alert(text);
    return;
  }

  if (buttons.length === 1) {
    window.alert(text);
    buttons[0].onPress?.();
    return;
  }

  const cancelButton = buttons.find((b) => b.style === "cancel");
  const confirmButton =
    buttons.find((b) => b.style !== "cancel") ?? buttons[buttons.length - 1];

  if (window.confirm(text)) {
    confirmButton?.onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
}

export default { alert };

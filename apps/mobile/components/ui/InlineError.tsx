import React, { useEffect } from 'react';
import { View } from 'react-native';
import { AlertCircle, XCircle, AlertTriangle, Info } from 'lucide-react-native';
import InterRegular from '../Text/InterRegular';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

interface InlineErrorProps {
  message: string;
  type?: 'error' | 'warning' | 'info';
  autoDismiss?: boolean;
  dismissAfter?: number; // milliseconds
  onDismiss?: () => void;
  className?: string;
}

const InlineError: React.FC<InlineErrorProps> = ({
  message,
  type = 'error',
  autoDismiss = false,
  dismissAfter = 5000,
  onDismiss,
  className = '',
}) => {
  useEffect(() => {
    if (autoDismiss && onDismiss) {
      const timer = setTimeout(() => {
        onDismiss();
      }, dismissAfter);

      return () => clearTimeout(timer);
    }
  }, [autoDismiss, dismissAfter, onDismiss]);

  const getIcon = () => {
    switch (type) {
      case 'error':
        return <XCircle size={16} color="#EF4444" />;
      case 'warning':
        return <AlertTriangle size={16} color="#F59E0B" />;
      case 'info':
        return <Info size={16} color="#3B82F6" />;
      default:
        return <AlertCircle size={16} color="#EF4444" />;
    }
  };

  const getColorClasses = () => {
    switch (type) {
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-amber-50 border-amber-200';
      case 'info':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-red-50 border-red-200';
    }
  };

  const getTextColor = () => {
    switch (type) {
      case 'error':
        return 'text-red-700';
      case 'warning':
        return 'text-amber-700';
      case 'info':
        return 'text-blue-700';
      default:
        return 'text-red-700';
    }
  };

  if (!message) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutUp.duration(200)}
      className={`flex-row items-start gap-2 p-3 rounded-lg border ${getColorClasses()} ${className}`}
    >
      <View className="mt-0.5">{getIcon()}</View>
      <InterRegular className={`flex-1 text-sm ${getTextColor()}`}>
        {message}
      </InterRegular>
    </Animated.View>
  );
};

export default InlineError;

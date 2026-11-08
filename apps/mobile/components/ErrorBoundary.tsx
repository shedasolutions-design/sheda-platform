import React, { Component, ReactNode } from 'react';
import { View, TouchableOpacity, ScrollView } from 'react-native';
import { AlertTriangle, Home, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react-native';
import InterSemiBold from './Text/InterSemiBold';
import InterRegular from './Text/InterRegular';
import InterMedium from './Text/InterMedium';
import { router } from 'expo-router';
import { logError, getErrorDetails } from '@/utilities/errorUtils';

interface Props {
  children: ReactNode;
  fallbackComponent?: (error: Error, resetError: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
}

/**
 * Error Boundary component that catches errors in the React component tree
 * and displays a fallback UI with recovery options
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error
    logError(error, 'ErrorBoundary');
    
    // Update state with error info
    this.setState({ errorInfo });
    
    // You can also log the error to an error reporting service here
    console.error('Error caught by boundary:', error, errorInfo);
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  goHome = () => {
    this.resetError();
    router.replace('/(tabs)/home');
  };

  toggleDetails = () => {
    this.setState({ showDetails: !this.state.showDetails });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // If a custom fallback is provided, use it
      if (this.props.fallbackComponent) {
        return this.props.fallbackComponent(this.state.error, this.resetError);
      }

      // Default fallback UI
      return (
        <View className="flex-1 bg-white">
          <ScrollView 
            className="flex-1" 
            contentContainerStyle={{ 
              flexGrow: 1, 
              justifyContent: 'center', 
              alignItems: 'center',
              padding: 20 
            }}
          >
            {/* Error Icon */}
            <View className="w-24 h-24 bg-red-50 rounded-full items-center justify-center mb-6 border border-red-100 shadow-sm">
              <AlertTriangle size={48} color="#ef4444" strokeWidth={1.5} />
            </View>

            {/* Error Title */}
            <InterSemiBold className="text-2xl text-red-600 text-center mb-3">
              Something Went Wrong
            </InterSemiBold>

            {/* Error Message */}
            <InterRegular className="text-center text-secondaryText mb-8 max-w-[320px] text-base leading-6">
              We encountered an unexpected error. Don't worry, your data is safe. Please try again.
            </InterRegular>

            {/* Action Buttons */}
            <View className="w-full max-w-[320px] gap-3">
              {/* Retry Button */}
              <TouchableOpacity
                onPress={this.resetError}
                activeOpacity={0.7}
                className="flex-row items-center justify-center gap-3 bg-primary px-8 py-4 rounded-2xl shadow-md active:shadow-sm"
              >
                <RefreshCw size={20} color="white" />
                <InterMedium className="text-white text-base">Try Again</InterMedium>
              </TouchableOpacity>

              {/* Go Home Button */}
              <TouchableOpacity
                onPress={this.goHome}
                activeOpacity={0.7}
                className="flex-row items-center justify-center gap-3 bg-gray-100 px-8 py-4 rounded-2xl active:bg-gray-200"
              >
                <Home size={20} color="#374151" />
                <InterMedium className="text-gray-700 text-base">Go Home</InterMedium>
              </TouchableOpacity>
            </View>

            {/* Error Details (Development Mode Only) */}
            {__DEV__ && (
              <View className="w-full max-w-[320px] mt-8">
                <TouchableOpacity
                  onPress={this.toggleDetails}
                  className="flex-row items-center justify-center gap-2 py-2"
                  activeOpacity={0.7}
                >
                  <InterRegular className="text-gray-500 text-sm">
                    {this.state.showDetails ? 'Hide' : 'Show'} Error Details
                  </InterRegular>
                  {this.state.showDetails ? (
                    <ChevronUp size={16} color="#6B7280" />
                  ) : (
                    <ChevronDown size={16} color="#6B7280" />
                  )}
                </TouchableOpacity>

                {this.state.showDetails && (
                  <View className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <InterRegular className="text-xs text-gray-700 font-mono">
                      {this.state.error.message}
                      {'\n\n'}
                      {this.state.error.stack}
                      {'\n\n'}
                      {getErrorDetails(this.state.error)}
                    </InterRegular>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

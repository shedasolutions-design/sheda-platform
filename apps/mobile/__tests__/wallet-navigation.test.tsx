// @ts-nocheck — Test file with Jest mocks
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { router } from 'expo-router';
import Wallet from '../app/(tabs)/wallet/index';
import { WalletProvider } from '../contexts/WalletContext';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
  },
  usePathname: jest.fn(() => '/(tabs)/wallet'),
}));

// Mock WalletContext
jest.mock('../contexts/WalletContext', () => ({
  useWallet: () => ({
    walletState: {
      isConnected: false,
      account: null,
    },
    getAccountBalance: jest.fn(),
    getAccountTransactions: jest.fn(),
    getTokenBalances: jest.fn(),
    loading: false,
  }),
  WalletProvider: ({ children }) => children,
}));

// Mock ApiContext and useAuth
jest.mock('@/contexts/ApiContext', () => ({
  useApi: jest.fn(() => ({})),
  ApiProvider: ({ children }: any) => children,
}));

jest.mock('@/hooks/useShedaApi', () => ({
  useAuth: jest.fn(() => ({
    isAuthenticated: true,
    user: { username: 'testuser' },
    isInitializing: false,
  })),
}));

// Mock the transaction toast hook — real one requires a ToastProvider tree,
// which this test doesn't render.
jest.mock('@/hooks/useTransactionToast', () => ({
  useTransactionToast: () => ({ run: jest.fn((opts) => opts.action()) }),
}));

// Mock components that might cause issues in tests
jest.mock('@/components/Text/InterSemiBold', () => 'InterSemiBold');
jest.mock('@/components/Text/InterMedium', () => 'InterMedium');
jest.mock('@/components/Text/InterRegular', () => 'InterRegular');
jest.mock('@/components/Text/InterExtraBold', () => 'InterExtraBold');
jest.mock('@/components/common/Icon', () => 'Icon');
jest.mock('@/components/common/Button', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return (props) => (
    <TouchableOpacity onPress={props.onPress} testID={props.testID}>
      <Text>{props.children}</Text>
    </TouchableOpacity>
  );
});
jest.mock('@/components/WalletDashboard', () => 'WalletDashboard');
jest.mock('@/components/organisms/WalletTabs', () => 'WalletTabs');
jest.mock('@/components/organisms/TokensList', () => 'TokensList');
jest.mock('@/components/organisms/AssetsList', () => 'AssetsList');
jest.mock('@/components/organisms/TransactionsList', () => 'TransactionsList');
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
}));

describe('Wallet Navigation', () => {
  it('should navigate to /wallet-setup when Connect Wallet is pressed', () => {
    let component;
    act(() => {
      component = renderer.create(
        <WalletProvider>
          <Wallet />
        </WalletProvider>
      );
    });

    const root = component.root;

    // Find the button by checking for onPress prop
    const buttons = root.findAll(node => node.props.onPress);

    const connectButton = buttons.find(button => {
      // Check if this button contains the text "Connect Wallet"
      // We can inspect the children
      // The structure is Button -> Text -> InterSemiBold -> "Connect Wallet"

      // Helper to recursively search for text in children
      const hasText = (node, text) => {
        if (typeof node === 'string') return node.includes(text);
        if (Array.isArray(node)) return node.some(child => hasText(child, text));
        if (node && node.props && node.props.children) return hasText(node.props.children, text);
        if (node && node.children) return hasText(node.children, text);
        return false;
      };

      return hasText(button, "Connect Wallet");
    });

    if (connectButton) {
      act(() => {
        connectButton.props.onPress();
      });

      expect(router.push).toHaveBeenCalledWith('/wallet-setup');
    } else {
      // If we can't find it by text, let's just try the first button with onPress
      // In the disconnected state, there is only one button "Connect Wallet"
      if (buttons.length > 0) {
        act(() => {
          buttons[0].props.onPress();
        });
        expect(router.push).toHaveBeenCalledWith('/wallet-setup');
      } else {
        throw new Error('Connect Wallet button not found');
      }
    }
  });
});

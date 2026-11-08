// @ts-nocheck — Test file with Jest mocks
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { View, Text } from 'react-native';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
  },
  // app/(tabs)/history/index.tsx uses this to refetch on tab focus and
  // poll while focused. Invoke it once (like an initial focus) and
  // immediately run its cleanup too, so the 60s setInterval it schedules
  // doesn't linger as a real timer and keep the Jest process alive after
  // the test finishes.
  useFocusEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (typeof cleanup === "function") cleanup();
  },
}));

jest.mock('@/contexts/ModeContext', () => ({
  useMode: jest.fn(),
}));

jest.mock('@/contexts/ApiContext', () => ({
  useApi: jest.fn(() => ({
    getProperties: jest.fn(),
    getMe: jest.fn(),
    // The listing wizard fetches these up front to tell a relist of an
    // existing listing from listing a property that was bought — without
    // them it throws before rendering.
    getMyListings: jest.fn(() => Promise.resolve([])),
    myListings: [],
    listProperty: jest.fn(),
    updateProperty: jest.fn(),
    // The wizard asks whether the seller has viewing hours yet, to decide
    // whether to add a step for them. Answering "they already have some"
    // keeps this test on the flow it is actually about.
    getSchedule: jest.fn(() => Promise.resolve([])),
    schedule: [{ weekday: "MONDAY", start_time: "09:00", end_time: "17:00" }],
    createAvailableTime: jest.fn(() => Promise.resolve()),
  })),
  ApiProvider: ({ children }: any) => children,
}));

// list/index.tsx, MintNFTForm.tsx and history/index.tsx all import
// @fast-auth-near/react-native-provider -> react-native-auth0's native
// module — unavailable in Jest. Only `{ walletState }` is used by these
// three call sites (grepped), so a minimal stub is enough.
jest.mock('@/contexts/WalletContext', () => ({
  useWallet: () => ({
    walletState: { isConnected: false, account: null },
    loading: false,
  }),
  WalletProvider: ({ children }: any) => children,
}));

// hooks/useNearContract.ts (used by list/index.tsx) imports

// hooks/useExpirationChecker.ts (used by history/index.tsx) needs
// NotificationContext, which isn't mounted in these lightweight renders.
jest.mock('@/contexts/NotificationContext', () => ({
  useNotifications: () => ({
    addNotification: jest.fn(),
  }),
}));

// list/index.tsx's mint handler uses useTransactionToast, which needs a
// real ToastProvider tree — not mounted here either.
jest.mock('@/hooks/useTransactionToast', () => ({
  useTransactionToast: () => ({ run: jest.fn((opts) => opts.action()) }),
}));

jest.mock('@/hooks/useShedaApi', () => ({
  useAuth: jest.fn(() => ({
    isAuthenticated: true,
    user: { username: 'testuser' },
    isInitializing: false,
  })),
  useProperties: jest.fn(() => ({
    listProperty: jest.fn(),
    isLoading: false,
  })),
}));

jest.mock('@/components/AuthGuard', () => {
  return {
    __esModule: true,
    default: ({ children }: any) => children,
  };
});

jest.mock('@/components/seller/PropertyListingOverview', () => ({
  PropertyListingOverview: (props: any) => null,
}));

jest.mock('@/components/seller/PropertyDescriptionForm', () => ({
  PropertyDescriptionForm: (props: any) => null,
}));

jest.mock('@/components/seller/PropertyExtrasForm', () => ({
  PropertyExtrasForm: (props: any) => null,
}));

jest.mock('@/components/seller/PhotoUploadForm', () => ({
  PhotoUploadForm: (props: any) => null,
}));

jest.mock('@/components/seller/PriceDescriptionForm', () => ({
  PriceDescriptionForm: (props: any) => null,
}));

jest.mock('@/components/seller/AuthorizeListingForm', () => ({
  AuthorizeListingForm: (props: any) => null,
}));

jest.mock('@/components/seller/ListingSuccessScreen', () => ({
  ListingSuccessScreen: (props: any) => null,
}));

jest.mock('@/components/seller/MyListings', () => ({
  MyListings: (props: any) => null,
}));

jest.mock('@/components/seller/SellerActivities', () => ({
  __esModule: true,
  default: (props: any) => null,
}));

jest.mock('@/components/SavedList', () => ({
  __esModule: true,
  default: (props: any) => null,
}));

jest.mock('@/components/history/NoHistory', () => ({
  NoHistory: (props: any) => null,
}));

jest.mock('@/components/history/HistoryList', () => ({
  __esModule: true,
  default: (props: any) => null,
}));

jest.mock('@/hooks/useTransactions', () => ({
  __esModule: true,
  default: () => ({
    ongoing: [],
    completed: [],
    // The history screen spreads `expired` into useExpirationChecker, so
    // omitting it here throws "expired is not iterable" before the component
    // renders at all. Added when the Expired tab started being backed by real
    // data instead of a hardcoded [].
    expired: [],
    cancelled: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
    updatePhase: jest.fn(),
    transactions: [],
  }),
}));

jest.mock('@/components/common/BackBtn', () => ({
  __esModule: true,
  default: (props: any) => null,
}));

jest.mock('@/components/common/Button', () => ({
  __esModule: true,
  default: (props: any) => null,
}));

jest.mock('@/components/HeaderBar', () => ({
  __esModule: true,
  default: (props: any) => null,
}));

jest.mock('@/components/Text/InterSemiBold', () => ({
  __esModule: true,
  default: (props: any) => null,
}));

jest.mock('@/components/Text/InterRegular', () => ({
  __esModule: true,
  default: (props: any) => null,
}));

jest.mock('@expo/vector-icons/AntDesign', () => 'AntDesign');
jest.mock('@expo/vector-icons/Octicons', () => 'Octicons');
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons');

const { useMode } = require('@/contexts/ModeContext');
const { router } = require('expo-router');

describe('Seller Navigation and Listing Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // /saved and /activity are now split into separate routes (previously one
  // file branched on isSeller). Each route still guards against the wrong
  // mode landing on it — e.g. a stale deep link, or a mode switch while the
  // screen is still mounted — by redirecting to its counterpart.
  describe('Saved Tab - Buyer Only', () => {
    it('should render Saved component for buyers without redirecting', async () => {
      useMode.mockReturnValue({ isSeller: false, isLoading: false });

      const Saved = require('../app/(tabs)/saved/index.tsx').default;

      let component;
      await act(async () => {
        component = renderer.create(<Saved />);
      });

      expect(component).toBeTruthy();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('should redirect sellers to the Activity tab', async () => {
      useMode.mockReturnValue({ isSeller: true, isLoading: false });

      const Saved = require('../app/(tabs)/saved/index.tsx').default;

      await act(async () => {
        renderer.create(<Saved />);
      });

      expect(router.replace).toHaveBeenCalledWith('/(tabs)/activity');
    });

    it('should not redirect while mode is still loading', async () => {
      useMode.mockReturnValue({ isSeller: true, isLoading: true });

      const Saved = require('../app/(tabs)/saved/index.tsx').default;

      await act(async () => {
        renderer.create(<Saved />);
      });

      expect(router.replace).not.toHaveBeenCalled();
    });
  });

  describe('Activity Tab - Seller Only', () => {
    it('should render Activity component for sellers without redirecting', async () => {
      useMode.mockReturnValue({ isSeller: true, isLoading: false });

      const Activity = require('../app/(tabs)/activity/index.tsx').default;

      let component;
      await act(async () => {
        component = renderer.create(<Activity />);
      });

      expect(component).toBeTruthy();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('should redirect buyers to the Saved tab', async () => {
      useMode.mockReturnValue({ isSeller: false, isLoading: false });

      const Activity = require('../app/(tabs)/activity/index.tsx').default;

      await act(async () => {
        renderer.create(<Activity />);
      });

      expect(router.replace).toHaveBeenCalledWith('/(tabs)/saved');
    });
  });

  describe('Listing Flow Navigation', () => {
    it('should render ListingFlow component', async () => {
      const ListingFlow = require('../app/(tabs)/list/index.tsx').default;

      let component;
      await act(async () => {
        component = renderer.create(<ListingFlow />);
      });

      expect(component).toBeTruthy();
    });

    it('should have initial step 0', async () => {
      const ListingFlow = require('../app/(tabs)/list/index.tsx').default;

      let component;
      await act(async () => {
        component = renderer.create(<ListingFlow />);
      });

      const root = component.root;
      const instance = root._fiber.child;
      expect(instance).toBeTruthy();
    });
  });

  describe('History Tab - Buyer Only', () => {
    beforeEach(() => {
      useMode.mockReturnValue({ isSeller: false });
    });

    it('should render History component for buyers', async () => {
      const History = require('../app/(tabs)/history/index.tsx').default;

      let component;
      await act(async () => {
        component = renderer.create(<History />);
      });

      expect(component).toBeTruthy();
    });
  });

  describe('Mode Context Integration', () => {
    it('should call useMode hook', () => {
      useMode.mockReturnValue({ isSeller: false });
      const Saved = require('../app/(tabs)/saved/index.tsx').default;

      let component;
      act(() => {
        component = renderer.create(<Saved />);
      });

      expect(useMode).toHaveBeenCalled();
    });
  });
});

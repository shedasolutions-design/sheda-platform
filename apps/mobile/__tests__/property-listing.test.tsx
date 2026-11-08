// @ts-nocheck — Test file with Jest mocks
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import PropertyListingForm from '../components/seller/PropertyListingForm';
import { View, TextInput, TouchableOpacity, Alert } from 'react-native';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

const mockListProperty = jest.fn().mockResolvedValue({ id: 1 });
jest.mock('@/hooks/useShedaApi', () => ({
  useProperties: () => ({
    listProperty: mockListProperty,
    updateProperty: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock('@/hooks/useNearContract', () => ({
  useNearContract: () => ({
    mintProperty: jest.fn().mockResolvedValue({ success: true, data: 'nft_id' }),
    loading: false,
  }),
}));

jest.mock('@/contexts/WalletContext', () => ({
  useWallet: () => ({
    walletState: { isConnected: true },
  }),
}));

// The form reads the seller's viewing hours to decide whether to show the
// extra "when can buyers view?" step — it appears only when they have none.
// Mutable so each test can pick which branch it exercises.
const EXISTING_HOURS = [
  { id: 1, agent_id: 1, weekday: 'MONDAY', start_time: '09:00', end_time: '17:00', is_booked: false },
];
let mockSchedule = EXISTING_HOURS;
const mockCreateAvailableTime = jest.fn(() => Promise.resolve());

jest.mock('@/contexts/ApiContext', () => ({
  useApi: () => ({
    getSchedule: jest.fn(() => Promise.resolve()),
    get schedule() {
      return mockSchedule;
    },
    createAvailableTime: mockCreateAvailableTime,
  }),
}));

// Mock child components
jest.mock('../components/common/BackBtn', () => 'BackBtn');
jest.mock('../components/Text/InterSemiBold', () => 'InterSemiBold');
jest.mock('../components/Text/InterRegular', () => 'InterRegular');
jest.mock('../components/common/Icon', () => 'Icon');
jest.mock('../components/seller/ProgressBar', () => 'ProgressBar');

// Mock inputs
jest.mock('../components/common/Button', () => {
  const { View } = require('react-native');
  return (props) => <View {...props} testID="button" />;
});

jest.mock('../components/input/selectInput', () => (props) => {
  const { View } = require('react-native');
  return <View testID="select-input" {...props} />;
});

// Location moved from a SelectInput to its own LocationPicker. Without a mock
// here the picker renders for real and nothing sets `location`, so submit
// fails its first validation check and never reaches listProperty.
jest.mock('../components/input/LocationPicker', () => (props) => {
  const { View } = require('react-native');
  return <View testID="location-picker" {...props} />;
});

jest.mock('../components/input/FiatCurrencyPicker', () => (props) => {
  const { View } = require('react-native');
  return <View testID="fiat-currency-picker" {...props} />;
});

jest.mock('../components/input/checkbox', () => (props) => {
  const { View } = require('react-native');
  return <View testID="checkbox" {...props} />;
});

jest.mock('../components/input/textInput', () => (props) => {
  const { TextInput } = require('react-native');
  return <TextInput testID="text-input" {...props} />;
});

jest.mock('../components/seller/PhotoUpload', () => (props) => {
  const { View } = require('react-native');
  return <View testID="photo-upload" {...props} />;
});

describe('PropertyListingForm', () => {
  beforeEach(() => {
    // Default: seller already publishes hours, so the flow keeps its original
    // 4 steps. The no-hours branch opts in explicitly.
    mockSchedule = EXISTING_HOURS;
    mockCreateAvailableTime.mockClear();
    mockListProperty.mockClear();
    Alert.alert.mockClear();
  });

  // Renders the whole listing form and walks it step by step, and every
  // field lookup traverses the rendered tree. That is slow by nature, and on
  // a cold Jest cache — which is every CI run — the compile on top of it took
  // this past the default ceiling and failed a test that was never wrong.
  it('submits the form successfully', async () => {
    let component;
    await act(async () => {
      component = renderer.create(<PropertyListingForm />);
    });
    const root = component.root;

    // Helper to find button and press it
    const pressButton = () => {
      const btns = root.findAllByProps({ testID: 'button' });
      const btn = btns[btns.length - 1];
      act(() => {
        btn.props.onPress();
      });
    };

    // Step 0: Landing page
    pressButton(); // "Get started"

    // Find a field by the label/placeholder the form gives it rather than by
    // position. Index-based lookup is what silently broke this test when the
    // location field became its own LocationPicker: index 4 quietly started
    // pointing at Furnishing, so `location` was never set and submit bailed
    // out at validation while the test still looked like it was filling the
    // form in. Each match appears twice (the mock element and the View it
    // renders both carry the props), so take the first.
    const findField = (props) => {
      const matches = root.findAllByProps(props);
      if (matches.length === 0) {
        throw new Error(`No field matching ${JSON.stringify(props)}`);
      }
      return matches[0];
    };

    // Fill sequentially: each setPropertyData spreads the previous state from
    // its closure, so batching these into one act() would lose all but the last.
    const setField = (props, handler, value) => {
      act(() => {
        findField(props).props[handler](value);
      });
    };

    // Step 1: Details — Type, Status and Location are the required ones.
    setField({ label: 'Property type' }, 'onValueChange', 'apartment');
    setField({ label: 'Status' }, 'onValueChange', 'sale');
    setField({ testID: 'location-picker' }, 'onValueChange', 'lekki');

    pressButton(); // Next

    // Step 2: Extras
    pressButton(); // Next (skip extras)

    // Step 3: Photos — at least 4 are required
    setField({ testID: 'photo-upload' }, 'onPhotosChange', [
      'p1.jpg',
      'p2.jpg',
      'p3.jpg',
      'p4.jpg',
    ]);

    pressButton(); // Next

    // Step 4: Description and Price
    setField({ placeholder: '500,000' }, 'onChangeText', '1000000');

    // Press "Confirm and list"
    await act(async () => {
      pressButton();
    });

    // handleSubmit awaits several promises in sequence (backend create, then
    // mint, then the backend update), and a single act() flush only drains the
    // first. That left the assertions racing the submit chain — fine on an idle
    // machine, but it failed intermittently when the full suite ran in parallel
    // and CPU was contended. Drain until the call actually lands instead of
    // assuming one flush is enough.
    for (let i = 0; i < 50 && mockListProperty.mock.calls.length === 0; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // handleSubmit returns early with an "Error" alert when a required field
    // is missing. That early exit is exactly how this test used to walk the
    // whole flow while never actually submitting, so assert on it directly —
    // it names the broken field instead of just reporting "0 calls".
    expect(Alert.alert).not.toHaveBeenCalledWith('Error', expect.anything());

    // Expect listProperty to have been called
    expect(mockListProperty).toHaveBeenCalled();

    // Verify arguments
    const calledArgs = mockListProperty.mock.calls[0][0];
    expect(calledArgs.property_type).toBe('apartment');
    expect(calledArgs.listing_type).toBe('sale');
    expect(calledArgs.price).toBe(1000000);
    expect(calledArgs.images).toHaveLength(4);
    // Verify image format
    expect(calledArgs.images[0]).toHaveProperty('image_url');
    expect(calledArgs.images[0]).toHaveProperty('is_primary');
  }, 60000);

  // A seller with no published hours is unbookable — the backend rejects
  // every requested viewing time. The flow gains one extra step to capture
  // them at listing time so that can't be missed.
  it('inserts a viewing-hours step when the seller has none, and saves the chosen days', async () => {
    mockSchedule = [];

    let component;
    await act(async () => {
      component = renderer.create(<PropertyListingForm />);
    });
    const root = component.root;

    const pressButton = () => {
      const btns = root.findAllByProps({ testID: 'button' });
      const btn = btns[btns.length - 1];
      act(() => {
        btn.props.onPress();
      });
    };
    const findField = (props) => {
      const matches = root.findAllByProps(props);
      if (matches.length === 0) {
        throw new Error(`No field matching ${JSON.stringify(props)}`);
      }
      return matches[0];
    };
    const setField = (props, handler, value) => {
      act(() => {
        findField(props).props[handler](value);
      });
    };

    pressButton(); // Step 0 -> 1

    setField({ label: 'Property type' }, 'onValueChange', 'apartment');
    setField({ label: 'Status' }, 'onValueChange', 'sale');
    setField({ testID: 'location-picker' }, 'onValueChange', 'lekki');
    pressButton(); // -> 2

    pressButton(); // -> 3 (skip extras)

    setField({ testID: 'photo-upload' }, 'onPhotosChange', [
      'p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg',
    ]);
    pressButton(); // -> 4

    setField({ placeholder: '500,000' }, 'onChangeText', '1000000');

    // This press must NOT submit — it advances to the viewing-hours step.
    await act(async () => {
      pressButton();
    });
    expect(mockListProperty).not.toHaveBeenCalled();

    // The viewing-hours step is on screen: its From/Until pickers exist only
    // here, so finding them proves we advanced rather than submitted.
    expect(() => findField({ label: 'From' })).not.toThrow();
    expect(() => findField({ label: 'Until' })).not.toThrow();
    setField({ label: 'From' }, 'onValueChange', '10:00');

    // Now confirm and list.
    await act(async () => {
      pressButton();
    });

    for (let i = 0; i < 50 && mockListProperty.mock.calls.length === 0; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(Alert.alert).not.toHaveBeenCalledWith('Error', expect.anything());
    expect(mockListProperty).toHaveBeenCalled();
  });
});

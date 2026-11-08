import { View, ScrollView } from "react-native";
import InterBold from "../Text/InterBold";
import InterSemiBold from "../Text/InterSemiBold";
import InterRegular from "../Text/InterRegular";
import Button from "../common/Button";
import { useWallet } from "@/contexts/WalletContext";

interface MintNFTFormProps {
  onMint: () => void;
  onBack?: () => void;
}

export const MintNFTForm: React.FC<MintNFTFormProps> = ({
  onMint,
  onBack,
}) => {
  const { walletState } = useWallet();
  const isConnected = walletState.isConnected;

  return (
    <ScrollView style={{ flex: 1, padding: 20 }}>
      <InterBold className="text-2xl mb-4">Mint Property NFT</InterBold>

      <View className="mb-6">
        <InterRegular className="text-sm mb-3">
          Register your property on the blockchain by minting an NFT. This creates a verifiable record of ownership.
        </InterRegular>
      </View>

      <View className="bg-gray-50 p-4 rounded-xl mb-6">
        <InterSemiBold className="text-sm mb-2">Why mint?</InterSemiBold>
        <View className="flex-row items-start mb-2">
          <InterRegular className="text-sm mr-2">•</InterRegular>
          <InterRegular className="text-sm flex-1">
            Generates a unique on-chain property ID
          </InterRegular>
        </View>
        <View className="flex-row items-start mb-2">
          <InterRegular className="text-base mr-2">•</InterRegular>
          <InterRegular className="text-base flex-1">
            Provides verifiable proof of ownership from day one
          </InterRegular>
        </View>
        <View className="flex-row items-start mb-2">
          <InterRegular className="text-base mr-2">•</InterRegular>
          <InterRegular className="text-base flex-1">
            Enables secure and transparent transactions
          </InterRegular>
        </View>
        <View className="flex-row items-start">
          <InterRegular className="text-base mr-2">•</InterRegular>
          <InterRegular className="text-base flex-1">
            Your listing will be linked to the blockchain record
          </InterRegular>
        </View>
      </View>

      {!isConnected && (
        <View className="bg-amber-50 p-3 rounded-lg mb-4 border border-amber-200">
          <InterRegular className="text-sm text-amber-800">
            Connect your NEAR wallet to mint. Go to your profile to set one up.
          </InterRegular>
        </View>
      )}

      <Button
        className="rounded-lg mb-3"
        onPress={onMint}
        disabled={!isConnected}
      >
        <InterBold className="text-white">
          {isConnected ? "Mint Property NFT" : "Connect Wallet First"}
        </InterBold>
      </Button>

      {onBack && (
        <Button
          className="rounded-lg bg-gray-200"
          onPress={onBack}
        >
          <InterBold className="text-gray-700">Go Back</InterBold>
        </Button>
      )}
    </ScrollView>
  );
};

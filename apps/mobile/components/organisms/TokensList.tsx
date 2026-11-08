import type React from "react"
import { ScrollView } from "react-native"
import TokenItem from "../molecules/TokenItem"
import type { Token } from "../../types/wallet"

interface TokensListProps {
  tokens: Token[]
  onTokenPress?: (token: Token) => void
}

const TokensList: React.FC<TokensListProps> = ({ tokens, onTokenPress }) => {
  return (
    <ScrollView className="flex-1">
      {tokens.map((token) => (
        <TokenItem key={token.id} token={token} onPress={onTokenPress} />
      ))}
    </ScrollView>
  )
}

export default TokensList

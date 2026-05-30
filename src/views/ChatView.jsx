import { useEffect } from 'react'
import ChatHeader from '@/components/chat/ChatHeader'
import MessageList from '@/components/chat/MessageList'
import ChatInput from '@/components/chat/ChatInput'
import { useChatStore } from '@/stores/useChatStore'

export default function ChatView() {
  useEffect(() => {
    useChatStore.getState().loadHistory()
  }, [])

  return (
    <div className="w-full h-full flex flex-col bg-white/40">
      <ChatHeader />
      <MessageList />
      <ChatInput />
    </div>
  )
}

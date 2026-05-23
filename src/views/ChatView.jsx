import ChatHeader from '@/components/chat/ChatHeader'
import MessageList from '@/components/chat/MessageList'
import ChatInput from '@/components/chat/ChatInput'

export default function ChatView() {
  return (
    <div className="w-full h-full flex flex-col bg-white/40">
      <ChatHeader />
      <MessageList />
      <ChatInput />
    </div>
  )
}

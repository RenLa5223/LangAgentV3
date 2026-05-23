import { useState } from 'react'
import Sidebar from '@/components/manage/Sidebar'
import EditorPanel from '@/components/manage/EditorPanel'

export default function ManageView() {
  const [activeTab, setActiveTab] = useState('agent-profile')

  return (
    <div className="w-full h-full flex overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <EditorPanel activeTab={activeTab} />
    </div>
  )
}

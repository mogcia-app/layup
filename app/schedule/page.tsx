'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, User } from 'firebase/auth'
import { collection, query, where, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import BottomNav from '@/components/BottomNav'

interface Schedule {
  id: string
  courseName: string
  date: string
  time: string
  memo: string
  createdAt: any
}

export default function Schedule() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [formData, setFormData] = useState({
    courseName: '',
    date: '',
    time: '',
    memo: '',
  })
  const [currentMonth, setCurrentMonth] = useState(new Date())

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user)
        await loadSchedules(user.uid)
        setLoading(false)
      } else {
        router.push('/')
      }
    })

    return () => unsubscribe()
  }, [router])

  const loadSchedules = async (userId: string) => {
    try {
      const schedulesQuery = query(
        collection(db, 'schedules'),
        where('userId', '==', userId),
        orderBy('date', 'asc')
      )
      const querySnapshot = await getDocs(schedulesQuery)
      const schedulesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Schedule[]

      setSchedules(schedulesData)
    } catch (error) {
      console.error('スケジュール取得エラー:', error)
    }
  }

  const handleOpenModal = (schedule?: Schedule, date?: string) => {
    if (schedule) {
      setEditingSchedule(schedule)
      setFormData({
        courseName: schedule.courseName,
        date: schedule.date,
        time: schedule.time,
        memo: schedule.memo || '',
      })
    } else {
      setEditingSchedule(null)
      setFormData({
        courseName: '',
        date: date || '',
        time: '',
        memo: '',
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingSchedule(null)
    setFormData({
      courseName: '',
      date: '',
      time: '',
      memo: '',
    })
  }

  const handleSave = async () => {
    if (!user || !formData.courseName.trim() || !formData.date) {
      alert('コース名と日付を入力してください')
      return
    }

    try {
      if (editingSchedule) {
        // 編集
        await updateDoc(doc(db, 'schedules', editingSchedule.id), {
          courseName: formData.courseName.trim(),
          date: formData.date,
          time: formData.time,
          memo: formData.memo.trim(),
          updatedAt: serverTimestamp(),
        })
      } else {
        // 新規追加
        await addDoc(collection(db, 'schedules'), {
          userId: user.uid,
          courseName: formData.courseName.trim(),
          date: formData.date,
          time: formData.time,
          memo: formData.memo.trim(),
          createdAt: serverTimestamp(),
        })
      }

      await loadSchedules(user.uid)
      handleCloseModal()
    } catch (error) {
      console.error('保存エラー:', error)
      alert('保存に失敗しました')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この予定を削除しますか？')) {
      return
    }

    try {
      await deleteDoc(doc(db, 'schedules', id))
      await loadSchedules(user!.uid)
    } catch (error) {
      console.error('削除エラー:', error)
      alert('削除に失敗しました')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekday = weekdays[date.getDay()]
    return `${month}/${day}(${weekday})`
  }

  const getDatesInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const dates: (Date | null)[] = []
    
    // 前月の空白を追加
    for (let i = 0; i < startingDayOfWeek; i++) {
      dates.push(null)
    }
    
    // 今月の日付を追加
    for (let day = 1; day <= daysInMonth; day++) {
      dates.push(new Date(year, month, day))
    }

    return dates
  }

  const formatDateString = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const hasScheduleOnDate = (date: Date) => {
    const dateString = formatDateString(date)
    return schedules.some(s => s.date === dateString)
  }

  const getSchedulesForDate = (date: Date) => {
    const dateString = formatDateString(date)
    return schedules.filter(s => s.date === dateString)
  }

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const groupSchedulesByDate = () => {
    const grouped: { [key: string]: Schedule[] } = {}
    schedules.forEach(schedule => {
      if (!grouped[schedule.date]) {
        grouped[schedule.date] = []
      }
      grouped[schedule.date].push(schedule)
    })
    return grouped
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    )
  }

  const dates = getDatesInMonth(currentMonth)
  const monthYear = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`
  const groupedSchedules = groupSchedulesByDate()
  const sortedDates = Object.keys(groupedSchedules).sort()

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">スケジュール</h1>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
          >
            + 追加
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Calendar */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={previousMonth}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-gray-800">{monthYear}</h2>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
              <div key={day} className="text-center text-sm font-medium text-gray-600 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {dates.map((date, index) => {
              if (!date) {
                return <div key={index} className="aspect-square"></div>
              }

              const dateString = formatDateString(date)
              const isToday = formatDateString(new Date()) === dateString
              const hasSchedule = hasScheduleOnDate(date)
              const daySchedules = getSchedulesForDate(date)

              return (
                <button
                  key={index}
                  onClick={() => {
                    if (hasSchedule && daySchedules.length > 0) {
                      handleOpenModal(daySchedules[0])
                    } else {
                      handleOpenModal(undefined, dateString)
                    }
                  }}
                  className={`aspect-square p-1 rounded-md transition-colors relative ${
                    isToday
                      ? 'bg-green-100 border-2 border-green-600'
                      : hasSchedule
                      ? 'bg-green-50 hover:bg-green-100'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className={`text-sm font-medium ${
                    isToday
                      ? 'text-green-700'
                      : hasSchedule
                      ? 'text-green-700'
                      : 'text-gray-700'
                  }`}>
                    {date.getDate()}
                  </div>
                  {hasSchedule && (
                    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2">
                      <div className="w-1.5 h-1.5 bg-green-600 rounded-full"></div>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Schedule List */}
        {sortedDates.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">予定一覧</h2>
            <div className="space-y-6">
              {sortedDates.map((date) => (
                <div key={date}>
                  <h3 className="text-md font-medium text-gray-700 mb-3">
                    {formatDate(date)}
                  </h3>
                  <div className="space-y-3">
                    {groupedSchedules[date].map((schedule) => (
                      <div
                        key={schedule.id}
                        className="bg-white rounded-lg shadow-sm p-4"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-800 mb-1">
                              {schedule.courseName}
                            </h4>
                            {schedule.time && (
                              <p className="text-sm text-gray-600 mb-1">
                                時間: {schedule.time}
                              </p>
                            )}
                            {schedule.memo && (
                              <p className="text-sm text-gray-500">
                                {schedule.memo}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2 ml-4">
                            <button
                              onClick={() => handleOpenModal(schedule)}
                              className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(schedule.id)}
                              className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-xs"
                            >
                              削除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {sortedDates.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-gray-500 text-center py-8">
              まだ予定がありません
              <br />
              <span className="text-sm">カレンダーの日付をクリックするか、「+ 追加」ボタンから予定を追加しましょう</span>
            </p>
          </div>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {editingSchedule ? '予定を編集' : '予定を追加'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  コース名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.courseName}
                  onChange={(e) => setFormData({ ...formData, courseName: e.target.value })}
                  placeholder="例: 〇〇ゴルフクラブ"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  日付 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  スタート時間
                </label>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  メモ
                </label>
                <textarea
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  placeholder="メモを入力（任意）"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
              >
                {editingSchedule ? '更新' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, User } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import BottomNav from '@/components/BottomNav'

interface Club {
  id: string
  name: string
  distance: number | null
  isDriver: boolean
  isPutter: boolean
}

export default function Settings() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clubs, setClubs] = useState<Club[]>([
    { id: 'driver', name: 'ドライバー', distance: 0, isDriver: true, isPutter: false },
    { id: 'putter', name: 'パター', distance: null, isPutter: true, isDriver: false },
  ])
  const [newClubName, setNewClubName] = useState('')
  const [newClubDistance, setNewClubDistance] = useState(0)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user)
        // Firestoreからクラブセッティングを読み込む
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid))
          if (userDoc.exists() && userDoc.data().clubs) {
            const savedClubs = userDoc.data().clubs as Club[]
            // ドライバーとパターは常に存在させる
            const defaultClubs = [
              { id: 'driver', name: 'ドライバー', distance: 0, isDriver: true, isPutter: false },
              { id: 'putter', name: 'パター', distance: null, isPutter: true, isDriver: false },
            ]
            
            // 保存済みのデータからドライバーとパターの情報を取得
            const driverFromSaved = savedClubs.find(c => c.isDriver)
            const putterFromSaved = savedClubs.find(c => c.isPutter)
            
            if (driverFromSaved) {
              defaultClubs[0] = { ...defaultClubs[0], distance: driverFromSaved.distance || 0 }
            }
            
            // その他のクラブを取得
            const otherClubs = savedClubs.filter(c => !c.isDriver && !c.isPutter)
            
            setClubs([...defaultClubs, ...otherClubs])
          }
        } catch (error) {
          console.error('データ読み込みエラー:', error)
        }
        setLoading(false)
      } else {
        router.push('/')
      }
    })

    return () => unsubscribe()
  }, [router])

  const handleDistanceChange = (id: string, distance: number | null) => {
    setClubs(clubs.map(club => 
      club.id === id ? { ...club, distance: distance === null ? null : distance } : club
    ))
  }

  const handleAddClub = () => {
    if (!newClubName.trim()) {
      alert('クラブ名を入力してください')
      return
    }

    const newClub: Club = {
      id: Date.now().toString(),
      name: newClubName.trim(),
      distance: newClubDistance || 0,
      isDriver: false,
      isPutter: false,
    }

    setClubs([...clubs, newClub])
    setNewClubName('')
    setNewClubDistance(0)
  }

  const handleRemoveClub = (id: string) => {
    const club = clubs.find(c => c.id === id)
    if (club?.isDriver || club?.isPutter) {
      alert('ドライバーとパターは削除できません')
      return
    }
    setClubs(clubs.filter(club => club.id !== id))
  }

  const handleSave = async () => {
    if (!user) return

    setSaving(true)

    try {
      await setDoc(doc(db, 'users', user.uid), {
        clubs: clubs,
        updatedAt: new Date(),
      }, { merge: true })

      alert('クラブセッティングを保存しました')
    } catch (error) {
      console.error('保存エラー:', error)
      alert('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    )
  }

  const customClubs = clubs.filter(c => !c.isDriver && !c.isPutter)

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-800">設定</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* クラブセッティング */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">クラブセッティング</h2>
          <div className="bg-white rounded-lg shadow-sm p-6">
            {/* ドライバー */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <div className="flex items-center justify-between py-3">
                <label className="text-gray-700 font-medium min-w-[80px]">
                  ドライバー
                </label>
                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <input
                    type="number"
                    value={clubs.find(c => c.isDriver)?.distance || ''}
                    onChange={(e) => {
                      const driver = clubs.find(c => c.isDriver)
                      if (driver) {
                        handleDistanceChange(driver.id, parseInt(e.target.value) || 0)
                      }
                    }}
                    placeholder="飛距離"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-right"
                    min="0"
                  />
                  <span className="text-gray-600 text-sm">yd</span>
                </div>
              </div>
            </div>

            {/* パター */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <div className="flex items-center justify-between py-3">
                <label className="text-gray-700 font-medium min-w-[80px]">
                  パター
                </label>
                <span className="text-gray-500 text-sm">飛距離入力不要</span>
              </div>
            </div>

            {/* その他のクラブ */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">その他のクラブ</h3>
              <div className="space-y-4">
                {customClubs.map((club) => (
                  <div key={club.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3 flex-1">
                      <input
                        type="text"
                        value={club.name}
                        onChange={(e) => {
                          setClubs(clubs.map(c => 
                            c.id === club.id ? { ...c, name: e.target.value } : c
                          ))
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="クラブ名"
                      />
                      <input
                        type="number"
                        value={club.distance || ''}
                        onChange={(e) => handleDistanceChange(club.id, parseInt(e.target.value) || 0)}
                        placeholder="飛距離"
                        className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-right"
                        min="0"
                      />
                      <span className="text-gray-600 text-sm">yd</span>
                    </div>
                    <button
                      onClick={() => handleRemoveClub(club.id)}
                      className="ml-3 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>

              {/* 新しいクラブ追加 */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="text"
                    value={newClubName}
                    onChange={(e) => setNewClubName(e.target.value)}
                    placeholder="クラブ名（例: 3W, 5I, PW）"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <input
                    type="number"
                    value={newClubDistance || ''}
                    onChange={(e) => setNewClubDistance(parseInt(e.target.value) || 0)}
                    placeholder="飛距離"
                    className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-right"
                    min="0"
                  />
                  <span className="text-gray-600 text-sm">yd</span>
                  <button
                    onClick={handleAddClub}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
                  >
                    追加
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-6 w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        {/* ユーザー情報 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">アカウント情報</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-600 mb-1">メールアドレス</p>
              <p className="text-gray-800">{user?.email}</p>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
}

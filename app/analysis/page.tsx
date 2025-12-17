'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, User } from 'firebase/auth'
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore'
import BottomNav from '@/components/BottomNav'

interface Round {
  id: string
  courseName: string
  totalScore: number
  totalPar: number
  girCount: number
  fairwayHitCount: number
  createdAt: any
  holes: Array<{
    hole: number
    par: number
    strokes: number
    putts: number
    gir: boolean
    fairway: 'hit' | 'miss' | null
    teeClub: string | null
    approachClub: string | null
  }>
}

export default function Analysis() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'club' | 'round'>('club')
  const [rounds, setRounds] = useState<Round[]>([])
  const [clubStats, setClubStats] = useState<{
    [clubName: string]: {
      teeUsage: number
      approachUsage: number
      teeSuccess: number
      approachSuccess: number
    }
  }>({})
  const [userClubs, setUserClubs] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user)
        try {
          // ラウンドデータを取得
          const roundsQuery = query(
            collection(db, 'rounds'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
          )
          const querySnapshot = await getDocs(roundsQuery)
          const roundsData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as Round[]

          setRounds(roundsData)

          // クラブセッティングを読み込む（パターを除く）
          const userDoc = await getDoc(doc(db, 'users', user.uid))
          if (userDoc.exists() && userDoc.data().clubs) {
            const clubs = userDoc.data().clubs
              .filter((club: { isPutter?: boolean }) => !club.isPutter)
              .map((club: { id: string; name: string }) => ({
                id: club.id,
                name: club.name,
              }))
            setUserClubs(clubs)
          }

          // クラブ使用統計を計算
          const clubUsageStats: {
            [clubName: string]: {
              teeUsage: number
              approachUsage: number
              teeSuccess: number
              approachSuccess: number
            }
          } = {}

          roundsData.forEach((round) => {
            if (round.holes) {
              round.holes.forEach((hole) => {
                // ティーショット統計
                if (hole.teeClub) {
                  if (!clubUsageStats[hole.teeClub]) {
                    clubUsageStats[hole.teeClub] = {
                      teeUsage: 0,
                      approachUsage: 0,
                      teeSuccess: 0,
                      approachSuccess: 0,
                    }
                  }
                  clubUsageStats[hole.teeClub].teeUsage++
                  if (hole.fairway === 'hit') {
                    clubUsageStats[hole.teeClub].teeSuccess++
                  }
                }

                // アプローチショット統計
                if (hole.approachClub) {
                  if (!clubUsageStats[hole.approachClub]) {
                    clubUsageStats[hole.approachClub] = {
                      teeUsage: 0,
                      approachUsage: 0,
                      teeSuccess: 0,
                      approachSuccess: 0,
                    }
                  }
                  clubUsageStats[hole.approachClub].approachUsage++
                  if (hole.gir) {
                    clubUsageStats[hole.approachClub].approachSuccess++
                  }
                }
              })
            }
          })

          setClubStats(clubUsageStats)
        } catch (error) {
          console.error('データ取得エラー:', error)
        }
        setLoading(false)
      } else {
        router.push('/')
      }
    })

    return () => unsubscribe()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-800">分析</h1>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-[73px] z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex">
            <button
              onClick={() => setActiveTab('club')}
              className={`flex-1 py-4 text-center font-medium transition-colors border-b-2 ${
                activeTab === 'club'
                  ? 'text-green-600 border-green-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              クラブ分析
            </button>
            <button
              onClick={() => setActiveTab('round')}
              className={`flex-1 py-4 text-center font-medium transition-colors border-b-2 ${
                activeTab === 'round'
                  ? 'text-green-600 border-green-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              過去のラウンド
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* クラブ分析タブ */}
        {activeTab === 'club' && (
          <div>
            {userClubs.length > 0 && Object.keys(clubStats).length > 0 ? (
              <div className="space-y-4">
                {userClubs.map((club) => {
                  const stats = clubStats[club.name]
                  if (!stats || (stats.teeUsage === 0 && stats.approachUsage === 0)) {
                    return null
                  }

                  const teeSuccessRate = stats.teeUsage > 0
                    ? Math.round((stats.teeSuccess / stats.teeUsage) * 100)
                    : 0
                  const approachSuccessRate = stats.approachUsage > 0
                    ? Math.round((stats.approachSuccess / stats.approachUsage) * 100)
                    : 0

                  return (
                    <div key={club.id} className="bg-white rounded-lg shadow-sm p-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">{club.name}</h3>
                      
                      {stats.teeUsage > 0 && (
                        <div className="mb-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">ティーショット</span>
                            <span className="text-sm text-gray-600">
                              {stats.teeUsage}回使用 / フェアウェイキープ: {stats.teeSuccess}回 ({teeSuccessRate}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className={`h-3 rounded-full transition-all ${
                                teeSuccessRate >= 70
                                  ? 'bg-green-500'
                                  : teeSuccessRate >= 50
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${teeSuccessRate}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {stats.approachUsage > 0 && (
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">アプローチショット</span>
                            <span className="text-sm text-gray-600">
                              {stats.approachUsage}回使用 / GIR達成: {stats.approachSuccess}回 ({approachSuccessRate}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className={`h-3 rounded-full transition-all ${
                                approachSuccessRate >= 70
                                  ? 'bg-green-500'
                                  : approachSuccessRate >= 50
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${approachSuccessRate}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <p className="text-gray-500 text-center py-8">
                  クラブ使用データがまだありません。スコア入力でクラブを記録しましょう。
                </p>
              </div>
            )}
          </div>
        )}

        {/* 過去のラウンドタブ */}
        {activeTab === 'round' && (
          <div>
            {rounds.length > 0 ? (
              <div className="space-y-4">
                {rounds.map((round) => (
                  <div key={round.id} className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800">{round.courseName}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {round.createdAt?.toDate?.().toLocaleDateString('ja-JP', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          }) || '-'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-gray-800">
                          {round.totalScore}
                        </p>
                        <p className="text-sm text-gray-600">
                          ({round.totalPar > 0 && round.totalScore - round.totalPar > 0 ? '+' : ''}
                          {round.totalPar > 0 ? round.totalScore - round.totalPar : ''})
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center">
                        <p className="text-xs text-gray-500 mb-1">GIR</p>
                        <p className="text-lg font-semibold text-gray-800">
                          {round.girCount}/18
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500 mb-1">フェアウェイキープ</p>
                        <p className="text-lg font-semibold text-gray-800">
                          {round.fairwayHitCount}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500 mb-1">平均パット</p>
                        <p className="text-lg font-semibold text-gray-800">
                          {round.holes && round.holes.length > 0
                            ? (round.holes.reduce((sum, h) => sum + (h.putts || 0), 0) / round.holes.length).toFixed(1)
                            : '-'}
                        </p>
                      </div>
                    </div>

                    {/* ホール別スコア */}
                    <div className="border-t border-gray-200 pt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">ホール別スコア</h4>
                      <div className="grid grid-cols-9 gap-1 text-xs">
                        {round.holes?.slice(0, 9).map((hole, idx) => (
                          <div key={idx} className="text-center">
                            <p className="text-gray-500">{hole.hole}</p>
                            <p className={`font-semibold ${
                              hole.strokes - hole.par === 0 ? 'text-green-600' :
                              hole.strokes - hole.par < 0 ? 'text-blue-600' :
                              'text-red-600'
                            }`}>
                              {hole.strokes}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-9 gap-1 text-xs mt-2">
                        {round.holes?.slice(9, 18).map((hole, idx) => (
                          <div key={idx + 9} className="text-center">
                            <p className="text-gray-500">{hole.hole}</p>
                            <p className={`font-semibold ${
                              hole.strokes - hole.par === 0 ? 'text-green-600' :
                              hole.strokes - hole.par < 0 ? 'text-blue-600' :
                              'text-red-600'
                            }`}>
                              {hole.strokes}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <p className="text-gray-500 text-center py-8">
                  まだラウンドデータがありません
                  <br />
                  <span className="text-sm">スコア入力からラウンドを開始しましょう</span>
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
}


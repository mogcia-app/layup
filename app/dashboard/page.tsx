'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, signOut, User } from 'firebase/auth'
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore'
import BottomNav from '@/components/BottomNav'
import Link from 'next/link'

interface Schedule {
  id: string
  courseName: string
  date: string
  time: string
  memo: string
}

interface Round {
  id: string
  courseName: string
  totalScore: number
  totalPar: number
  girCount: number
  fairwayHitCount: number
  createdAt: any
  holes: Array<{
    teeClub: string | null
    approachClub: string | null
    gir: boolean
    fairway: 'hit' | 'miss' | null
  }>
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [rounds, setRounds] = useState<Round[]>([])
  const [stats, setStats] = useState({
    averageScore: 0,
    bestScore: 0,
    roundCount: 0,
    girRate: 0,
  })
  const [clubStats, setClubStats] = useState<{
    [clubName: string]: {
      teeUsage: number
      approachUsage: number
      teeSuccess: number
      approachSuccess: number
    }
  }>({})
  const [userClubs, setUserClubs] = useState<Array<{ id: string; name: string }>>([])
  const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user)
        // ラウンドデータを取得
        try {
          const roundsQuery = query(
            collection(db, 'rounds'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(10)
          )
          const querySnapshot = await getDocs(roundsQuery)
          const roundsData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as Round[]

          setRounds(roundsData)

          // クラブセッティングを読み込む（パターを除く）
          try {
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
          } catch (error) {
            console.error('クラブデータ読み込みエラー:', error)
          }

          // 今後の予定を取得
          try {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const todayString = today.toISOString().split('T')[0]

            const schedulesQuery = query(
              collection(db, 'schedules'),
              where('userId', '==', user.uid),
              where('date', '>=', todayString),
              orderBy('date', 'asc'),
              limit(5)
            )
            const schedulesSnapshot = await getDocs(schedulesQuery)
            const schedulesData = schedulesSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
            })) as Schedule[]

            setUpcomingSchedules(schedulesData)
          } catch (error) {
            console.error('予定データ取得エラー:', error)
          }

          // 統計を計算
          if (roundsData.length > 0) {
            const scores = roundsData.map(r => r.totalScore)
            const totalGir = roundsData.reduce((sum, r) => sum + r.girCount, 0)
            const totalHoles = roundsData.length * 18

            setStats({
              averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
              bestScore: Math.min(...scores),
              roundCount: roundsData.length,
              girRate: totalHoles > 0 ? Math.round((totalGir / totalHoles) * 100) : 0,
            })

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
          }
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

  const handleLogout = async () => {
    try {
      await signOut(auth)
      router.push('/')
    } catch (error) {
      console.error('ログアウトエラー:', error)
    }
  }

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">ダッシュボード</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 分析セクション */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">ゴルフ分析</h2>
          
          {/* 統計カード */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-sm text-gray-600 mb-1">平均スコア</p>
              <p className="text-2xl font-bold text-gray-800">
                {stats.roundCount > 0 ? stats.averageScore : '-'}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-sm text-gray-600 mb-1">ベストスコア</p>
              <p className="text-2xl font-bold text-gray-800">
                {stats.roundCount > 0 ? stats.bestScore : '-'}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-sm text-gray-600 mb-1">ラウンド数</p>
              <p className="text-2xl font-bold text-gray-800">{stats.roundCount}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-sm text-gray-600 mb-1">GIR率</p>
              <p className="text-2xl font-bold text-gray-800">
                {stats.roundCount > 0 ? `${stats.girRate}%` : '-%'}
              </p>
            </div>
          </div>

          {/* AIアドバイスセクション */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">AIからのアドバイス</h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              {stats.roundCount > 0 ? (
                <div className="text-gray-700 text-sm space-y-2">
                  <p>• 平均スコアは{stats.averageScore}です。{stats.averageScore > stats.bestScore + 5 ? 'ベストスコアに近づけるよう、安定性を向上させましょう。' : '良い調子です！'}</p>
                  <p>• GIR率は{stats.girRate}%です。{stats.girRate < 50 ? 'アプローチショットの精度を上げる練習をしましょう。' : '良い数値です。'}</p>
                </div>
              ) : (
                <p className="text-gray-700 text-sm">
                  データが集まり次第、あなたのラウンドのクセやスコアの縮め方、日々の練習方法をアドバイスします。
                </p>
              )}
            </div>
          </div>

          {/* クラブセッティング分析 */}
          {userClubs.length > 0 && Object.keys(clubStats).length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">クラブセッティング分析</h3>
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
                    <div key={club.id} className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-800 mb-3">{club.name}</h4>
                      
                      {stats.teeUsage > 0 && (
                        <div className="mb-3">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-gray-600">ティーショット使用回数</span>
                            <span className="text-sm font-medium text-gray-800">
                              {stats.teeUsage}回
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                teeSuccessRate >= 70
                                  ? 'bg-green-500'
                                  : teeSuccessRate >= 50
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${teeSuccessRate}%` }}
                            ></div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            フェアウェイキープ率: {teeSuccessRate}%
                          </p>
                        </div>
                      )}

                      {stats.approachUsage > 0 && (
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-gray-600">アプローチショット使用回数</span>
                            <span className="text-sm font-medium text-gray-800">
                              {stats.approachUsage}回
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                approachSuccessRate >= 70
                                  ? 'bg-green-500'
                                  : approachSuccessRate >= 50
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${approachSuccessRate}%` }}
                            ></div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            GIR達成率: {approachSuccessRate}%
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 今後のラウンド予定 */}
        {upcomingSchedules.length > 0 && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">今後のラウンド予定</h2>
              <Link
                href="/schedule"
                className="text-sm text-green-600 hover:text-green-700 font-medium"
              >
                すべて見る →
              </Link>
            </div>
            <div className="space-y-3">
              {upcomingSchedules.map((schedule) => {
                const scheduleDate = new Date(schedule.date)
                const weekdays = ['日', '月', '火', '水', '木', '金', '土']
                const formattedDate = `${scheduleDate.getMonth() + 1}/${scheduleDate.getDate()}(${weekdays[scheduleDate.getDay()]})`

                return (
                  <div
                    key={schedule.id}
                    className="bg-white rounded-lg shadow-sm p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800 mb-1">
                          {schedule.courseName}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {formattedDate}
                          {schedule.time && ` ${schedule.time}`}
                        </p>
                        {schedule.memo && (
                          <p className="text-sm text-gray-500 mt-1">
                            {schedule.memo}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 最近のラウンド */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">最近のラウンド</h2>
          {rounds.length > 0 ? (
            <div className="space-y-3">
              {rounds.map((round) => (
                <div
                  key={round.id}
                  className="bg-white rounded-lg shadow-sm p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-800">{round.courseName}</h3>
                      <p className="text-sm text-gray-500">
                        {round.createdAt?.toDate?.().toLocaleDateString('ja-JP') || '-'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-800">
                        {round.totalScore}
                      </p>
                      <p className="text-sm text-gray-600">
                        ({round.totalPar > 0 && round.totalScore - round.totalPar > 0 ? '+' : ''}
                        {round.totalPar > 0 ? round.totalScore - round.totalPar : ''})
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm text-gray-600">
                    <span>GIR: {round.girCount}/18</span>
                    <span>FW: {round.fairwayHitCount}</span>
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
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
}

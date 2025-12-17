'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, User } from 'firebase/auth'
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc, query, where, orderBy, limit, getDocs, deleteDoc } from 'firebase/firestore'
import BottomNav from '@/components/BottomNav'
import { getCourseData, CourseHole } from '@/lib/course-data'

interface PastRound {
  id: string
  totalScore: number
  totalPar: number
  girCount: number
  fairwayHitCount: number
  holes: Array<{
    hole: number
    strokes: Array<{
      strokeNumber: number
      club: string
    }> | number // 古いデータ構造では数値の場合もある
    putts: number
    gir: boolean
    fairway: 'hit' | 'miss' | null
  }>
}

interface Stroke {
  strokeNumber: number // 1打目、2打目...
  club: string // クラブ名
  memo: string // メモ
}

interface Putt {
  type: 'long' | 'middle' | 'short' // ロング（10m以上）、ミドル（8m）、ショート（3m以内）
  distance: number // 距離（メートル）
  memo: string // メモ
}

interface PuttInfo {
  putts: Putt[] // 各パットの情報（1パット目、2パット目...）
}

interface HoleScore {
  hole: number
  par: number
  yardage: number | null // ヤード数（編集可能）
  strokes: Stroke[] // 各打数の情報
  puttInfo: PuttInfo | null // パット情報
  totalStrokes: number // 合計ストローク数（自動計算）
  totalPutts: number // 合計パット数（自動計算）
  gir: boolean
  fairway: 'hit' | 'miss' | null
}

interface RoundSetup {
  date: string // YYYY-MM-DD
  courseName: string
  targetScore: number
  focusPoint: string
  weather: string
  teeGround: 'blue' | 'white' | 'red'
  startFrom: 'in' | 'out'
}

export default function Score() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(false)
  const [setup, setSetup] = useState<RoundSetup>({
    date: new Date().toISOString().split('T')[0], // 今日の日付
    courseName: '日ノ隈カントリークラブ',
    targetScore: 0,
    focusPoint: '',
    weather: '',
    teeGround: 'white',
    startFrom: 'out',
  })
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0)
  const [holes, setHoles] = useState<HoleScore[]>([])
  const [availableClubs, setAvailableClubs] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [aiAdvice, setAiAdvice] = useState<string>('')
  const [pastRounds, setPastRounds] = useState<PastRound[]>([])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user)
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
            setAvailableClubs(clubs)
          }
        } catch (error) {
          console.error('クラブデータ読み込みエラー:', error)
        }

        // 過去のラウンドデータを取得してAIアドバイスを生成
        try {
          const roundsQuery = query(
            collection(db, 'rounds'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(10)
          )
          const querySnapshot = await getDocs(roundsQuery)
          const fetchedPastRounds = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as PastRound[]

          setPastRounds(fetchedPastRounds)

          if (fetchedPastRounds.length > 0) {
            const advice = generateAIAdvice(fetchedPastRounds)
            setAiAdvice(advice)
          } else {
            setAiAdvice('データを蓄積しましょう。ラウンドを重ねることで、あなたに最適なアドバイスを提供できるようになります。')
          }
        } catch (error) {
          console.error('過去のラウンドデータ取得エラー:', error)
          // エラーが発生した場合もメッセージを表示
          setAiAdvice('データを蓄積しましょう。ラウンドを重ねることで、あなたに最適なアドバイスを提供できるようになります。')
        }

            // Firestoreからドラフト状態を復元
            try {
              const draftQuery = query(
                collection(db, 'draftRounds'),
                where('userId', '==', user.uid),
                limit(1)
              )
              const draftSnapshot = await getDocs(draftQuery)
              if (!draftSnapshot.empty) {
                const draftData = draftSnapshot.docs[0].data()
                if (draftData.setup && draftData.holes && draftData.currentHoleIndex !== undefined) {
                  setSetup(draftData.setup as RoundSetup)
                  
                  // 古いデータ構造を新しい構造に変換
                  const restoredHoles = (draftData.holes as any[]).map((hole: any): HoleScore => {
                    // 既に新しい構造（strokesが配列）の場合はそのまま
                    if (Array.isArray(hole.strokes)) {
                      return {
                        ...hole,
                        strokes: hole.strokes,
                        puttInfo: hole.puttInfo || null,
                        totalStrokes: hole.totalStrokes || 0,
                        totalPutts: hole.totalPutts || 0,
                      }
                    }
                    
                    // 古い構造（strokesが数値）の場合は新しい構造に変換
                    return {
                      hole: hole.hole,
                      par: hole.par,
                      yardage: hole.yardage || null,
                      strokes: [
                        { strokeNumber: 1, club: hole.teeClub || '', memo: '' },
                        { strokeNumber: 2, club: hole.approachClub || '', memo: '' },
                      ],
                      puttInfo: hole.putts > 0 ? {
                        putts: Array(hole.putts).fill(null).map(() => ({
                          type: 'middle' as const,
                          distance: 0,
                          memo: '',
                        })),
                      } : null,
                      totalStrokes: hole.strokes || 0,
                      totalPutts: hole.putts || 0,
                      gir: hole.gir || false,
                      fairway: hole.fairway || null,
                    }
                  })
                  
                  setHoles(restoredHoles)
                  setCurrentHoleIndex(draftData.currentHoleIndex as number)
                  setSetupComplete(true)
                  console.log('ドラフト状態を復元しました')
                }
              }
            } catch (error) {
              console.error('ドラフト状態の復元エラー:', error)
            }

        setLoading(false)
      } else {
        router.push('/')
      }
    })

    return () => unsubscribe()
  }, [router])

  // AIアドバイスを生成する関数
  const generateAIAdvice = (rounds: PastRound[]): string => {
    if (rounds.length === 0) return ''

    // 統計を計算
    const totalRounds = rounds.length
    const totalHoles = totalRounds * 18
    const averageScore = rounds.reduce((sum, r) => sum + r.totalScore, 0) / totalRounds
    const totalGir = rounds.reduce((sum, r) => sum + r.girCount, 0)
    const totalFairwayHit = rounds.reduce((sum, r) => sum + r.fairwayHitCount, 0)
    const totalPutts = rounds.reduce((sum, r) => sum + r.holes.reduce((hSum, h) => hSum + (h.putts || 0), 0), 0)
    const averagePutts = totalPutts / totalHoles
    const girRate = (totalGir / totalHoles) * 100
    const fairwayRate = (totalFairwayHit / (totalRounds * 14)) * 100 // PAR4,5のみ

    // アドバイスを生成
    const advices: string[] = []

    // GIR率に基づくアドバイス
    if (girRate < 30) {
      advices.push('GIR率が低めです。アプローチショットの精度を上げる練習を意識しましょう。')
    } else if (girRate < 50) {
      advices.push('GIR率を改善するとスコアが縮みます。距離感を意識したアプローチ練習を。')
    } else if (girRate >= 70) {
      advices.push('GIR率が高いですね！パッティングの精度を上げるとさらにスコアが良くなります。')
    }

    // フェアウェイキープ率に基づくアドバイス
    if (fairwayRate < 40) {
      advices.push('ティーショットの方向性を安定させると、スコアが大きく改善します。')
    } else if (fairwayRate >= 60) {
      advices.push('ティーショットが安定しています。アプローチとパッティングに集中しましょう。')
    }

    // パット数に基づくアドバイス
    if (averagePutts > 2.0) {
      advices.push('パット数を減らすことでスコアが縮みます。距離感とライン読みの練習を。')
    } else if (averagePutts < 1.8) {
      advices.push('パッティングが良い調子です。この調子を維持しましょう。')
    }

    // 平均スコアに基づくアドバイス
    if (averageScore > 100) {
      advices.push('まずはOBやペナルティを減らすことを意識すると、スコアが安定します。')
    } else if (averageScore < 90) {
      const bestScore = Math.min(...rounds.map(r => r.totalScore))
      if (averageScore > bestScore + 5) {
        advices.push(`ベストスコア（${bestScore}）に近づけるよう、安定性を向上させましょう。`)
      }
    }

    // 最も重要なアドバイスを1つ返す
    if (advices.length > 0) {
      return advices[0]
    }

    return '過去のデータを分析中です。ラウンドを続けることで、より具体的なアドバイスを提供できます。'
  }

  // コース情報を読み込む（コード内の定義を優先、なければFirestoreから取得）
  const loadCourseData = async (courseName: string): Promise<CourseHole[]> => {
    // まずコード内の定義から取得を試みる
    const courseData = getCourseData(courseName)
    if (courseData) {
      return courseData.holes
    }

    // コード内にない場合はFirestoreから取得を試みる
    try {
      const courseDoc = await getDoc(doc(db, 'courses', courseName))
      if (courseDoc.exists()) {
        const firestoreData = courseDoc.data()
        if (firestoreData.holes && Array.isArray(firestoreData.holes)) {
          return firestoreData.holes as CourseHole[]
        }
      }
    } catch (error) {
      console.error('コースデータ読み込みエラー:', error)
    }
    
    // どちらもない場合は空配列を返す（デフォルト値を使用）
    return []
  }

  // 設定完了時にホールを初期化
  const handleSetupComplete = async () => {
    // コース情報を読み込む
    const loadedCourseHoles = await loadCourseData(setup.courseName)
    const courseData = getCourseData(setup.courseName)

    // OUTスタートなら1-9、INスタートなら10-18
    const startHole = setup.startFrom === 'out' ? 1 : 10
    const endHole = setup.startFrom === 'out' ? 9 : 18
    const holeNumbers = Array.from({ length: endHole - startHole + 1 }, (_, i) => startHole + i)

    const initialHoles = holeNumbers.map((holeNum) => {
      // コース情報からPARを取得、なければデフォルト値4
      const courseHole = loadedCourseHoles.find(ch => ch.hole === holeNum)
      // コースデータからヤード数を取得
      let initialYardage: number | null = null
      if (courseData) {
        const holeData = courseData.holes.find((h: CourseHole) => h.hole === holeNum)
        if (holeData) {
          initialYardage = setup.teeGround === 'blue' 
            ? holeData.backTee 
            : setup.teeGround === 'red'
            ? holeData.backTee
            : holeData.regularTee
        }
      }
      return {
        hole: holeNum,
        par: courseHole?.par || 4,
        yardage: initialYardage,
        strokes: [
          { strokeNumber: 1, club: '', memo: '' }, // ティーショット
          { strokeNumber: 2, club: '', memo: '' }, // 2打目
        ],
        puttInfo: {
          putts: [
            { type: 'middle' as const, distance: 0, memo: '' }, // 1パット目
            { type: 'middle' as const, distance: 0, memo: '' }, // 2パット目
          ],
        },
        totalStrokes: 0,
        totalPutts: 0,
        gir: false,
        fairway: null,
      }
    })

    setHoles(initialHoles)
    setCurrentHoleIndex(0)
    setSetupComplete(true)

    // Firestoreにドラフトとして保存
    await saveDraft(setup, initialHoles, 0)
  }

  // ドラフトをFirestoreに保存する関数
  const saveDraft = async (setupData: RoundSetup, holesData: HoleScore[], currentIndex: number) => {
    if (!user) return

    try {
      // 既存のドラフトを検索
      const draftQuery = query(
        collection(db, 'draftRounds'),
        where('userId', '==', user.uid),
        limit(1)
      )
      const draftSnapshot = await getDocs(draftQuery)

      const draftData = {
        userId: user.uid,
        setup: setupData,
        holes: holesData,
        currentHoleIndex: currentIndex,
        updatedAt: serverTimestamp(),
      }

      if (!draftSnapshot.empty) {
        // 既存のドラフトを更新
        await setDoc(draftSnapshot.docs[0].ref, draftData)
      } else {
        // 新しいドラフトを作成
        await addDoc(collection(db, 'draftRounds'), draftData)
      }
    } catch (error) {
      console.error('ドラフト保存エラー:', error)
    }
  }

  const updateHole = (index: number, updates: Partial<HoleScore>) => {
    const newHoles = [...holes]
    const updatedHole = { ...newHoles[index], ...updates }
    // 合計ストローク数とパット数を自動計算
    updatedHole.totalStrokes = calculateHoleTotalStrokes(updatedHole)
    updatedHole.totalPutts = getHoleTotalPutts(updatedHole)
    newHoles[index] = updatedHole
    setHoles(newHoles)
    // Firestoreにドラフトとして保存
    saveDraft(setup, newHoles, currentHoleIndex)
  }

  // ストロークを追加
  const addStroke = (holeIndex: number) => {
    const hole = holes[holeIndex]
    if (!Array.isArray(hole.strokes) || hole.strokes.length >= 20) return // 最大20打目まで
    
    const newStrokes = [...hole.strokes, { strokeNumber: hole.strokes.length + 1, club: '', memo: '' }]
    updateHole(holeIndex, { strokes: newStrokes })
  }

  // ストロークを削除
  const removeStroke = (holeIndex: number, strokeIndex: number) => {
    const hole = holes[holeIndex]
    if (!Array.isArray(hole.strokes) || hole.strokes.length <= 2) return // ティーショットと2打目は必須
    
    const newStrokes = hole.strokes.filter((_, i) => i !== strokeIndex)
      .map((stroke, i) => ({ ...stroke, strokeNumber: i + 1 })) // 打数を再割り当て
    updateHole(holeIndex, { strokes: newStrokes })
  }

  // ストロークのクラブを更新
  const updateStrokeClub = (holeIndex: number, strokeIndex: number, club: string) => {
    const hole = holes[holeIndex]
    if (!Array.isArray(hole.strokes)) return
    const newStrokes = [...hole.strokes]
    newStrokes[strokeIndex] = { ...newStrokes[strokeIndex], club }
    updateHole(holeIndex, { strokes: newStrokes })
  }

  // ストロークのメモを更新
  const updateStrokeMemo = (holeIndex: number, strokeIndex: number, memo: string) => {
    const hole = holes[holeIndex]
    if (!Array.isArray(hole.strokes)) return
    const newStrokes = [...hole.strokes]
    newStrokes[strokeIndex] = { ...newStrokes[strokeIndex], memo }
    updateHole(holeIndex, { strokes: newStrokes })
  }

  // パット情報を更新
  const updatePuttInfo = (holeIndex: number, puttInfo: PuttInfo | null) => {
    updateHole(holeIndex, { puttInfo })
  }

  // パットを追加
  const addPutt = (holeIndex: number) => {
    const hole = holes[holeIndex]
    const currentPutts = hole.puttInfo?.putts || []
    // 1パット目と2パット目が存在しない場合は初期化
    const existingPutts = currentPutts.length >= 2 ? currentPutts : [
      { type: 'middle' as const, distance: 0, memo: '' },
      { type: 'middle' as const, distance: 0, memo: '' },
    ]
    const newPutts = [...existingPutts, { type: 'middle' as const, distance: 0, memo: '' }]
    updatePuttInfo(holeIndex, { putts: newPutts })
  }

  // パットを削除
  const removePutt = (holeIndex: number, puttIndex: number) => {
    const hole = holes[holeIndex]
    if (!hole.puttInfo || !hole.puttInfo.putts) return
    if (hole.puttInfo.putts.length <= 2) return // 1パット目と2パット目は必須
    const newPutts = hole.puttInfo.putts.filter((_, i) => i !== puttIndex)
    updatePuttInfo(holeIndex, { putts: newPutts })
  }

  // パットの距離タイプを更新
  const updatePuttType = (holeIndex: number, puttIndex: number, type: 'long' | 'middle' | 'short') => {
    const hole = holes[holeIndex]
    if (!hole.puttInfo || !hole.puttInfo.putts) return
    const newPutts = [...hole.puttInfo.putts]
    newPutts[puttIndex] = { ...newPutts[puttIndex], type }
    updatePuttInfo(holeIndex, { putts: newPutts })
  }

  // パットの距離を更新
  const updatePuttDistance = (holeIndex: number, puttIndex: number, distance: number) => {
    const hole = holes[holeIndex]
    if (!hole.puttInfo || !hole.puttInfo.putts) return
    const newPutts = [...hole.puttInfo.putts]
    newPutts[puttIndex] = { ...newPutts[puttIndex], distance }
    updatePuttInfo(holeIndex, { putts: newPutts })
  }

  // パットのメモを更新
  const updatePuttMemo = (holeIndex: number, puttIndex: number, memo: string) => {
    const hole = holes[holeIndex]
    if (!hole.puttInfo || !hole.puttInfo.putts) return
    const newPutts = [...hole.puttInfo.putts]
    newPutts[puttIndex] = { ...newPutts[puttIndex], memo }
    updatePuttInfo(holeIndex, { putts: newPutts })
  }

  const handleNextHole = () => {
    if (currentHoleIndex < holes.length - 1) {
      const newIndex = currentHoleIndex + 1
      setCurrentHoleIndex(newIndex)
      // Firestoreにドラフトとして保存
      saveDraft(setup, holes, newIndex)
    }
  }

  const handlePrevHole = () => {
    if (currentHoleIndex > 0) {
      const newIndex = currentHoleIndex - 1
      setCurrentHoleIndex(newIndex)
      // Firestoreにドラフトとして保存
      saveDraft(setup, holes, newIndex)
    }
  }

  const calculateTotalScore = () => {
    return holes.reduce((sum, hole) => sum + hole.totalStrokes, 0)
  }

  // ホールの合計ストローク数を計算
  const calculateHoleTotalStrokes = (hole: HoleScore): number => {
    if (!Array.isArray(hole.strokes)) return 0
    return hole.strokes.length + (hole.puttInfo?.putts?.length || 0)
  }

  // ホールの合計パット数を取得
  const getHoleTotalPutts = (hole: HoleScore): number => {
    return hole.puttInfo?.putts?.length || 0
  }

  const calculateTotalPar = () => {
    return holes.reduce((sum, hole) => sum + hole.par, 0)
  }

  const handleSaveRound = async () => {
    if (!user) return

    const incompleteHoles = holes.filter(h => h.totalStrokes === 0)
    if (incompleteHoles.length > 0) {
      if (!confirm('未入力のホールがありますが、保存しますか？')) {
        return
      }
    }

    setSaving(true)

    try {
      // 18ホール分のデータを作成（IN/OUTによって順序が異なる）
      const all18Holes: HoleScore[] = Array.from({ length: 18 }, (_, i) => {
        const holeNum = i + 1
        const inputHole = holes.find(h => h.hole === holeNum)
        if (inputHole) {
          return inputHole
        }
        // デフォルトホール
        return {
          hole: holeNum,
          par: 4,
          yardage: null,
          strokes: [
            { strokeNumber: 1, club: '', memo: '' },
            { strokeNumber: 2, club: '', memo: '' },
          ],
          puttInfo: null,
          totalStrokes: 0,
          totalPutts: 0,
          gir: false,
          fairway: null,
        }
      })

      await addDoc(collection(db, 'rounds'), {
        userId: user.uid,
        courseName: setup.courseName,
        date: setup.date,
        targetScore: setup.targetScore,
        focusPoint: setup.focusPoint,
        weather: setup.weather,
        teeGround: setup.teeGround,
        startFrom: setup.startFrom,
        holes: all18Holes,
        totalScore: calculateTotalScore(),
        totalPar: calculateTotalPar(),
        girCount: holes.filter(h => h.gir).length,
        fairwayHitCount: holes.filter(h => h.fairway === 'hit').length,
        createdAt: serverTimestamp(),
      })

      // ドラフトを削除
      try {
        const draftQuery = query(
          collection(db, 'draftRounds'),
          where('userId', '==', user.uid),
          limit(1)
        )
        const draftSnapshot = await getDocs(draftQuery)
        if (!draftSnapshot.empty) {
          await deleteDoc(draftSnapshot.docs[0].ref)
        }
      } catch (error) {
        console.error('ドラフト削除エラー:', error)
      }

      alert('スコアを保存しました！')
      // リセット
      setSetupComplete(false)
      setSetup({
        date: new Date().toISOString().split('T')[0],
        courseName: '日ノ隈カントリークラブ',
        targetScore: 0,
        focusPoint: '',
        weather: '',
        teeGround: 'white',
        startFrom: 'out',
      })
      setHoles([])
      setCurrentHoleIndex(0)
    } catch (error) {
      console.error('保存エラー:', error)
      alert('スコアの保存に失敗しました')
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

  // 設定画面
  if (!setupComplete) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* Header */}
        <header className="bg-white shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <h1 className="text-2xl font-bold text-gray-800">スコア入力</h1>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* 日付入力 */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              日付
            </label>
            <input
              type="date"
              value={setup.date}
              onChange={(e) => setSetup({ ...setup, date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-lg font-medium"
            />
          </div>

          {/* コース名選択（タブ式） */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              コース名
            </label>
            <div className="flex">
              <button
                onClick={() => setSetup({ ...setup, courseName: '日ノ隈カントリークラブ' })}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  setup.courseName === '日ノ隈カントリークラブ'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                日ノ隈カントリークラブ
              </button>
            </div>
          </div>

          {/* 目標スコア */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              今日の目標スコア
            </label>
            <input
              type="number"
              value={setup.targetScore || ''}
              onChange={(e) => setSetup({ ...setup, targetScore: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="目標スコアを入力"
              min="0"
            />
          </div>

          {/* 注力ポイント */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              今日の注力ポイント
            </label>
            <textarea
              value={setup.focusPoint}
              onChange={(e) => setSetup({ ...setup, focusPoint: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="今日意識したいポイントを入力"
              rows={3}
            />
          </div>

          {/* AIワンポイントアドバイス */}
          <div className="bg-green-50 border border-green-200 rounded-lg shadow-sm p-4 mb-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-semibold text-green-800 mb-1">AIからのワンポイントアドバイス</h3>
                <p className="text-sm text-green-700">
                  {aiAdvice || 'データを蓄積しましょう。ラウンドを重ねることで、あなたに最適なアドバイスを提供できるようになります。'}
                </p>
              </div>
            </div>
          </div>

          {/* 天気 */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              天気
            </label>
            <input
              type="text"
              value={setup.weather}
              onChange={(e) => setSetup({ ...setup, weather: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="例: 晴れ、曇り、雨など"
            />
          </div>

          {/* ティーグラウンド */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              ティーグラウンド
            </label>
            <div className="flex gap-2">
              {(['blue', 'white', 'red'] as const).map((tee) => (
                <button
                  key={tee}
                  onClick={() => setSetup({ ...setup, teeGround: tee })}
                  className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                    setup.teeGround === tee
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tee === 'blue' ? '青' : tee === 'white' ? '白' : '赤'}
                </button>
              ))}
            </div>
          </div>

          {/* IN/OUTスタート */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              スタート
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSetup({ ...setup, startFrom: 'out' })}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  setup.startFrom === 'out'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                OUT（1番スタート）
              </button>
              <button
                onClick={() => setSetup({ ...setup, startFrom: 'in' })}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  setup.startFrom === 'in'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                IN（10番スタート）
              </button>
            </div>
          </div>

          {/* 開始ボタン */}
          <button
            onClick={handleSetupComplete}
            className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium"
          >
            スコア入力開始
          </button>
        </main>

        <BottomNav />
      </div>
    )
  }

  // スコア入力画面
  const currentHole = holes[currentHoleIndex]
  const startHole = setup.startFrom === 'out' ? 1 : 10

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-xl font-bold text-gray-800">{setup.courseName}</h1>
          <p className="text-sm text-gray-600">
            {setup.startFrom === 'out' ? '1番ホール' : '10番ホール'}スタート
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 現在のホール表示 */}
        {currentHole && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
            {/* 1番ホールの場合は画像を表示 */}
            {currentHole.hole === 1 && (
              <div className="mb-6">
                <Image
                  src="/out1.png"
                  alt="1番ホールマップ"
                  width={600}
                  height={400}
                  className="w-full h-auto rounded-lg"
                  priority
                />
              </div>
            )}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-800 text-center">
                {currentHole.hole}番
              </h2>
              <div className="text-center mt-2 space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg text-gray-700 font-medium">
                    PAR {currentHole.par}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={currentHole.yardage || ''}
                      onChange={(e) => updateHole(currentHoleIndex, {
                        yardage: parseInt(e.target.value) || null,
                      })}
                      placeholder="ヤード数"
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-center"
                      min="0"
                    />
                    <span className="text-lg text-gray-600">yd</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ストローク入力 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ストローク
              </label>
              <div className="space-y-2">
                {Array.isArray(currentHole.strokes) && currentHole.strokes.map((stroke, strokeIndex) => {
                  // 過去の履歴からこのホール、この打数で使用されたクラブを集計
                  const getRecommendedClub = (holeNumber: number, strokeNumber: number): string | null => {
                    const clubCounts: { [clubName: string]: number } = {}
                    
                    pastRounds.forEach((round: PastRound) => {
                      const hole = round.holes.find((h: any) => h.hole === holeNumber)
                      if (hole && Array.isArray(hole.strokes)) {
                        const strokeData = hole.strokes.find((s: any) => s.strokeNumber === strokeNumber)
                        if (strokeData && strokeData.club) {
                          clubCounts[strokeData.club] = (clubCounts[strokeData.club] || 0) + 1
                        }
                      }
                    })
                    
                    // 最も多く使われたクラブを返す
                    const sortedClubs = Object.entries(clubCounts).sort((a, b) => b[1] - a[1])
                    return sortedClubs.length > 0 ? sortedClubs[0][0] : null
                  }

                  const recommendedClub = getRecommendedClub(currentHole.hole, stroke.strokeNumber)
                  
                  return (
                    <div key={strokeIndex} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 w-16">
                          {stroke.strokeNumber}打目
                        </span>
                        <select
                          value={stroke.club}
                          onChange={(e) => updateStrokeClub(currentHoleIndex, strokeIndex, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                          size={undefined}
                        >
                          <option value="">クラブを選択</option>
                          {availableClubs.map((club) => (
                            <option key={club.id} value={club.name}>
                              {club.name}
                            </option>
                          ))}
                        </select>
                        {strokeIndex >= 2 && (
                          <button
                            onClick={() => removeStroke(currentHoleIndex, strokeIndex)}
                            className="px-2 py-2 text-red-600 hover:text-red-700 text-sm"
                          >
                            削除
                          </button>
                        )}
                      </div>
                      <div className="ml-16">
                        <input
                          type="text"
                          value={stroke.memo || ''}
                          onChange={(e) => updateStrokeMemo(currentHoleIndex, strokeIndex, e.target.value)}
                          placeholder="メモ（例: 右に曲がった、OBなど）"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                        />
                      </div>
                      {/* 過去履歴に基づく推奨クラブ */}
                      <div className="ml-16">
                        {recommendedClub ? (
                          <p className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-md px-2 py-1">
                            過去の履歴によると次のショットは<strong className="text-blue-700">{recommendedClub}</strong>を選択しています。
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
                            履歴があると過去に選択したクラブが表示されます。
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
                {currentHole.strokes.length < 20 && (
                  <button
                    onClick={() => addStroke(currentHoleIndex)}
                    className="w-full py-2 px-4 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
                  >
                    + ストロークを追加
                  </button>
                )}
              </div>
            </div>

            {/* パット情報 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                パット情報
              </label>
              <div className="space-y-4">
                {/* 1パット目と2パット目をデフォルト表示 */}
                {(() => {
                  // puttInfoが存在しない場合は初期化
                  if (!currentHole.puttInfo) {
                    updatePuttInfo(currentHoleIndex, {
                      putts: [
                        { type: 'middle' as const, distance: 0, memo: '' },
                        { type: 'middle' as const, distance: 0, memo: '' },
                      ],
                    })
                    return null
                  }
                  
                  const putts = currentHole.puttInfo.putts || []
                  // 1パット目と2パット目が存在しない場合は初期化
                  if (putts.length < 2) {
                    const newPutts = [
                      ...putts,
                      ...Array(2 - putts.length).fill(null).map(() => ({
                        type: 'middle' as const,
                        distance: 0,
                        memo: '',
                      }))
                    ]
                    updatePuttInfo(currentHoleIndex, { putts: newPutts })
                    return null // 再レンダリングを待つ
                  }
                  
                  return putts.map((putt, puttIndex) => (
                    <div key={puttIndex} className="space-y-2 border border-gray-200 rounded-md p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          {puttIndex + 1}パット目
                        </span>
                        {puttIndex >= 2 && (
                          <button
                            onClick={() => removePutt(currentHoleIndex, puttIndex)}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            削除
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={putt.type}
                          onChange={(e) => updatePuttType(currentHoleIndex, puttIndex, e.target.value as 'long' | 'middle' | 'short')}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                        >
                          <option value="long">ロング（10m以上）</option>
                          <option value="middle">ミドル（8m）</option>
                          <option value="short">ショート（3m以内）</option>
                        </select>
                        <input
                          type="number"
                          value={putt.distance || ''}
                          onChange={(e) => updatePuttDistance(currentHoleIndex, puttIndex, parseFloat(e.target.value) || 0)}
                          placeholder="何歩"
                          className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                          min="0"
                          step="0.1"
                        />
                        <span className="text-sm text-gray-600 flex items-center">歩</span>
                      </div>
                      <input
                        type="text"
                        value={putt.memo || ''}
                        onChange={(e) => updatePuttMemo(currentHoleIndex, puttIndex, e.target.value)}
                        placeholder="メモ（例: ライン読みミス、距離感など）"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                      />
                    </div>
                  ))
                })()}
                {/* パット追加ボタン */}
                <button
                  onClick={() => addPutt(currentHoleIndex)}
                  className="w-full py-2 px-4 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
                >
                  + パットを追加
                </button>
              </div>
            </div>


            {/* GIR */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                GIR（グリーンオン）
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => updateHole(currentHoleIndex, { gir: true })}
                  className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                    currentHole.gir
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  達成
                </button>
                <button
                  onClick={() => updateHole(currentHoleIndex, { gir: false })}
                  className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                    !currentHole.gir && currentHole.totalStrokes > 0
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  未達成
                </button>
              </div>
            </div>

            {/* フェアウェイ */}
            {currentHole.par >= 4 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  フェアウェイキープ
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateHole(currentHoleIndex, { fairway: 'hit' })}
                    className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                      currentHole.fairway === 'hit'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    キープ
                  </button>
                  <button
                    onClick={() => updateHole(currentHoleIndex, { fairway: 'miss' })}
                    className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                      currentHole.fairway === 'miss'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ミス
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ナビゲーション */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex justify-between items-center">
            <button
              onClick={handlePrevHole}
              disabled={currentHoleIndex === 0}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              ← 前のホール
            </button>
            <span className="text-sm text-gray-600">
              {currentHoleIndex + 1} / {holes.length}
            </span>
            {currentHoleIndex < holes.length - 1 ? (
              <button
                onClick={handleNextHole}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
              >
                次のホール →
              </button>
            ) : (
              <button
                onClick={handleSaveRound}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            )}
          </div>
        </div>

        {/* 合計スコア */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-700 font-medium">合計スコア</span>
            <span className="text-2xl font-bold text-gray-800">
              {calculateTotalScore()}（{holes.reduce((sum, h) => sum + h.totalPutts, 0)}）
            </span>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}

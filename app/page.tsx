'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function Page() {
  const router = useRouter()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.push('/dashboard')
    } catch (err: any) {
      let errorMessage = 'ログインに失敗しました'
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'メールアドレスまたはパスワードが正しくありません'
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'メールアドレスまたはパスワードが正しくありません'
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'メールアドレスの形式が正しくありません'
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'ログイン試行回数が多すぎます。しばらく待ってから再度お試しください'
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)

    try {
      await createUserWithEmailAndPassword(auth, email, password)
      setToast('登録しました！')
      setTimeout(() => {
        setToast('')
        router.push('/dashboard')
      }, 1500)
    } catch (err: any) {
      let errorMessage = 'サインアップに失敗しました'
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'このメールアドレスは既に登録されています'
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'パスワードが弱すぎます（6文字以上）'
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'メールアドレスの形式が正しくありません'
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-in fade-in slide-in-from-top-5">
          {toast}
        </div>
      )}
      
      <div 
        className="min-h-screen bg-white flex items-center justify-center px-4 relative"
        style={{
          backgroundImage: 'url(/layup-3.svg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/layup-2.png"
            alt="Layup Logo"
            width={150}
            height={150}
            className="mb-4"
          />
          <h1 className="text-2xl font-bold text-gray-800 text-center">
            Lay up -
          </h1>
          <p className="text-gray-600 text-center mt-2">
            AIで振り返る、ゴルフのPDCA
          </p>
        </div>

        {/* Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          {/* Sign In Form */}
        {!isSignUp && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label htmlFor="signin-email" className="block text-xs font-medium text-gray-700 mb-1">
                メールアドレス
              </label>
              <input
                id="signin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="demo@gmail.com"
              />
            </div>

            <div>
              <label htmlFor="signin-password" className="block text-xs font-medium text-gray-700 mb-1">
                パスワード
              </label>
              <input
                id="signin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white py-1.5 px-2 text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'ログイン中...' : 'サインイン'}
            </button>

            <div className="text-center mt-6">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  setIsSignUp(true)
                  setError('')
                }}
                className="text-green-600 hover:text-green-700 font-medium"
              >
                新規登録
              </button>
            </div>
          </form>
        )}

        {/* Sign Up Form */}
        {isSignUp && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label htmlFor="signup-username" className="block text-xs font-medium text-gray-700 mb-1">
                ユーザー名
              </label>
              <input
                id="signup-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Masum Ahmed"
              />
            </div>

            <div>
              <label htmlFor="signup-email" className="block text-xs font-medium text-gray-700 mb-1">
                メールアドレス
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="demo@gmail.com"
              />
            </div>

            <div>
              <label htmlFor="signup-password" className="block text-xs font-medium text-gray-700 mb-1">
                パスワード
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="signup-confirm-password" className="block text-xs font-medium text-gray-700 mb-1">
                パスワード確認
              </label>
              <input
                id="signup-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white py-1.5 px-2 text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? '登録中...' : 'サインアップ'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false)
                  setError('')
                }}
                className="text-green-600 hover:text-green-700 text-sm"
              >
                サインインに戻る
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
    </>
  )
}

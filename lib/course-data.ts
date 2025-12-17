// コースデータの定義

export interface CourseHole {
  hole: number
  par: number
  backTee: number // B.T（青ティー）のヤード数
  regularTee: number // R.T（白ティー）のヤード数
}

export interface Course {
  name: string
  holes: CourseHole[]
}

// 日ノ隈カントリークラブのコースデータ
export const hinokumaCountryClub: Course = {
  name: '日ノ隈カントリークラブ',
  holes: [
    { hole: 1, par: 4, backTee: 305, regularTee: 286 },
    { hole: 2, par: 5, backTee: 485, regularTee: 467 },
    { hole: 3, par: 5, backTee: 504, regularTee: 482 },
    { hole: 4, par: 4, backTee: 400, regularTee: 375 },
    { hole: 5, par: 3, backTee: 190, regularTee: 183 },
    { hole: 6, par: 4, backTee: 368, regularTee: 352 },
    { hole: 7, par: 4, backTee: 350, regularTee: 330 },
    { hole: 8, par: 3, backTee: 176, regularTee: 154 },
    { hole: 9, par: 4, backTee: 408, regularTee: 380 },
    { hole: 10, par: 4, backTee: 368, regularTee: 335 },
    { hole: 11, par: 5, backTee: 480, regularTee: 441 },
    { hole: 12, par: 3, backTee: 164, regularTee: 137 },
    { hole: 13, par: 4, backTee: 300, regularTee: 250 },
    { hole: 14, par: 4, backTee: 401, regularTee: 380 },
    { hole: 15, par: 4, backTee: 380, regularTee: 351 },
    { hole: 16, par: 5, backTee: 472, regularTee: 427 },
    { hole: 17, par: 3, backTee: 135, regularTee: 121 },
    { hole: 18, par: 4, backTee: 363, regularTee: 349 },
  ],
}

// コース名からコースデータを取得する関数
export function getCourseData(courseName: string): Course | null {
  if (courseName === '日ノ隈カントリークラブ') {
    return hinokumaCountryClub
  }
  return null
}


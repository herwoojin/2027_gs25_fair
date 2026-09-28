'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * 보기 모드 — 낮(light) · 밤(dark) · 종이(paper).
 *
 * 선택은 **하루 동안** 유지된다. 행사 기간이 여러 날이라 영구 저장하면
 * "어제 눌러 둔 모드"를 잊고 들어와 당황하시는 분이 생긴다. 하루마다 다시 묻는다.
 *
 * 값을 실제로 적용하는 것은 `<html data-theme="...">` 하나뿐이고,
 * 색은 globals.css 의 CSS 변수가 전부 담당한다. 그래서 컴포넌트는
 * 모드를 몰라도 되고, 여기서 바꾸면 화면 전체가 따라온다.
 */

export type ThemeMode = 'light' | 'dark' | 'paper';

export const THEME_STORAGE_KEY = 'gs25expo.theme';
export const THEME_EXPIRY_KEY = 'gs25expo.theme.exp';
const DAY_MS = 24 * 60 * 60 * 1000;

interface ThemeCtx {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  /** 저장된 선택이 없을 때만 true — 최초(그리고 하루 뒤) 1회 팝업 */
  needPicker: boolean;
  dismissPicker: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'light',
  setTheme: () => {},
  needPicker: false,
  dismissPicker: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function readStored(): ThemeMode | null {
  try {
    const exp = localStorage.getItem(THEME_EXPIRY_KEY);
    if (!exp || Date.now() > Number(exp)) {
      localStorage.removeItem(THEME_STORAGE_KEY);
      localStorage.removeItem(THEME_EXPIRY_KEY);
      return null;
    }
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'paper' ? v : null;
  } catch {
    // 사파리 프라이빗 모드 등 — 저장이 막혀도 앱은 동작해야 한다
    return null;
  }
}

function persist(t: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
    localStorage.setItem(THEME_EXPIRY_KEY, String(Date.now() + DAY_MS));
  } catch {
    /* noop */
  }
}

function applyToDom(t: ThemeMode) {
  const el = document.documentElement;
  el.setAttribute('data-theme', t);
  // 스크롤바·기본 폼 컨트롤도 같이 따라오게 한다
  el.style.colorScheme = t === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 서버 렌더에서는 light 로 둔다. 실제 적용은 layout 의 사전 스크립트가
  // 첫 페인트 전에 끝내므로 화면이 번쩍이지 않는다.
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [needPicker, setNeedPicker] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setThemeState(stored);
      applyToDom(stored);
    } else {
      setNeedPicker(true);
      applyToDom('light');
    }
  }, []);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    persist(t);
    applyToDom(t);
    setNeedPicker(false);
  }, []);

  const dismissPicker = useCallback(() => {
    setNeedPicker(false);
    // 그냥 닫으신 것도 "밝은 모드로 보겠다"는 선택으로 본다.
    // 저장하지 않으면 페이지를 옮길 때마다 다시 떠서 성가시다.
    if (!readStored()) persist('light');
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, needPicker, dismissPicker }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * 첫 페인트 전에 실행되는 사전 스크립트.
 *
 * React 가 붙기를 기다리면 흰 화면이 한 번 번쩍인 뒤 어두워진다(FOUC).
 * 그래서 이 한 줄만 <head> 에서 동기로 돌려 data-theme 를 먼저 박는다.
 */
export const THEME_BOOTSTRAP_SCRIPT = `
(function(){try{
  var e=localStorage.getItem('${THEME_EXPIRY_KEY}');
  var t=(!e||Date.now()>Number(e))?null:localStorage.getItem('${THEME_STORAGE_KEY}');
  if(t!=='light'&&t!=='dark'&&t!=='paper')t='light';
  document.documentElement.setAttribute('data-theme',t);
  document.documentElement.style.colorScheme=t==='dark'?'dark':'light';
}catch(_){}})();
`.trim();

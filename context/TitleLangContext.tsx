import React, { createContext, useContext, useState } from 'react';

type TitleLang = 'english' | 'romaji';

interface TitleLangContextValue {
  titleLang: TitleLang;
  toggleTitleLang: () => void;
}

const TitleLangContext = createContext<TitleLangContextValue | null>(null);

export function TitleLangProvider({ children }: { children: React.ReactNode }) {
  const [titleLang, setTitleLang] = useState<TitleLang>('english');

  const toggleTitleLang = () => {
    setTitleLang((l) => (l === 'english' ? 'romaji' : 'english'));
  };

  return (
    <TitleLangContext.Provider value={{ titleLang, toggleTitleLang }}>
      {children}
    </TitleLangContext.Provider>
  );
}

export function useTitleLang() {
  const ctx = useContext(TitleLangContext);
  if (!ctx) throw new Error('useTitleLang must be used within TitleLangProvider');
  return ctx;
}

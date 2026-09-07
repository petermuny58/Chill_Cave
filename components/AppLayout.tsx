import React from 'react';
import Header from './Header';
import { TitleLangProvider } from '../context/TitleLangContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TitleLangProvider>
      <Header />
      {children}
    </TitleLangProvider>
  );
}

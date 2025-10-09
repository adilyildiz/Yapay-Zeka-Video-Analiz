import React from 'react';

interface ThemeSwitcherProps {
  theme: string;
  onThemeChange: (theme: 'light' | 'dark') => void;
}

const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ theme, onThemeChange }) => {
  return (
    <div className="theme-switcher">
      <button 
        className={`theme-option light ${theme === 'light' ? 'active' : ''}`}
        onClick={() => onThemeChange('light')}
        title="Light Theme"
      >
        ☀️
      </button>
      <button 
        className={`theme-option dark ${theme === 'dark' ? 'active' : ''}`}
        onClick={() => onThemeChange('dark')}
        title="Dark Theme"
      >
        🌙
      </button>
    </div>
  );
};

export default ThemeSwitcher;
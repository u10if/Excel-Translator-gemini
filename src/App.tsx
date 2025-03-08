import React from 'react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { ExcelTranslator } from './components/ExcelTranslator';

const theme = createTheme({
  direction: 'ltr',
  typography: {
    fontFamily: 'Arial, sans-serif',
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ExcelTranslator />
    </ThemeProvider>
  );
}

export default App; 
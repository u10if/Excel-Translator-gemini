import React, { useState, useCallback } from 'react';
import { read, utils, writeFile } from 'xlsx';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Snackbar,
  Stack,
  LinearProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import { CONFIG } from '../config/constants';
import axios from 'axios';

interface TranslatedData {
  original: string;
  translated: string;
}

const RATE_LIMIT_DELAY = 1000; // 1 second delay between requests
const BATCH_SIZE = 10; // Process 10 items at a time

export const ExcelTranslator: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TranslatedData[]>([]);
  const [error, setError] = useState<string>('');
  const [originalFileName, setOriginalFileName] = useState<string>('');
  const [progress, setProgress] = useState(0);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const translateText = async (text: string): Promise<string> => {
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const response = await axios.post(
        `${CONFIG.API_URL}?key=${apiKey}`,
        {
          contents: [{
            parts: [{
              text: `${CONFIG.PROMPT_PERSIAN}\n${text}`
            }]
          }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.data.candidates[0].content.parts[0].text;
      } else {
        console.error('API Response:', response.data);
        throw new Error('Invalid response format from API');
      }
    } catch (error) {
      console.error('Translation error:', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429 || error.response?.data?.error?.message?.includes('quota')) {
          throw new Error('API quota exceeded. Please try again later or use a different API key.');
        } else if (error.response?.status === 401) {
          throw new Error('Invalid API key. Please check your Gemini API key.');
        } else {
          throw new Error(error.response?.data?.error?.message || error.message);
        }
      }
      throw new Error('An unexpected error occurred during translation');
    }
  };

  const translateBatch = async (texts: string[]): Promise<string[]> => {
    const results: string[] = [];
    for (const text of texts) {
      try {
        const translated = await translateText(text);
        results.push(translated);
        await delay(RATE_LIMIT_DELAY);
      } catch (error) {
        if (error instanceof Error && error.message.includes('quota')) {
          throw error; // Rethrow quota errors to stop the entire process
        }
        results.push(CONFIG.DEBUG_TRANSLATED_PERSIAN);
        console.error('Error translating text:', error);
      }
    }
    return results;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    setProgress(0);
    setData([]);
    
    try {
      setOriginalFileName(file.name);
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = utils.sheet_to_json<{ [key: string]: string }>(worksheet, { header: 1 });

      const textsToTranslate = jsonData.filter(row => row[0]).map(row => row[0]);
      const totalBatches = Math.ceil(textsToTranslate.length / BATCH_SIZE);
      const translatedData: TranslatedData[] = [];

      for (let i = 0; i < textsToTranslate.length; i += BATCH_SIZE) {
        const batch = textsToTranslate.slice(i, i + BATCH_SIZE);
        try {
          const translatedBatch = await translateBatch(batch);
          translatedBatch.forEach((translated, index) => {
            translatedData.push({
              original: batch[index],
              translated,
            });
          });
          const progress = Math.min(((i + BATCH_SIZE) / textsToTranslate.length) * 100, 100);
          setProgress(progress);
          setData([...translatedData]); // Update UI with progress
        } catch (error) {
          if (error instanceof Error && error.message.includes('quota')) {
            setError(error.message);
            break;
          }
        }
      }

      if (translatedData.length > 0) {
        setData(translatedData);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      setError('Error processing file. Please make sure it is a valid Excel file.');
    } finally {
      setLoading(false);
      setProgress(100);
    }
  };

  const handleExport = () => {
    try {
      // Create worksheet with headers
      const ws = utils.json_to_sheet([
        { Original: 'Original Text', Translated: 'Persian Translation' },
        ...data.map(row => ({
          Original: row.original,
          Translated: row.translated
        }))
      ], { skipHeader: true });

      // Set column widths
      ws['!cols'] = [
        { wch: 30 }, // Original column
        { wch: 30 }  // Translated column
      ];

      // Create workbook
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Translations');

      // Generate filename
      const exportFileName = originalFileName
        ? `translated_${originalFileName}`
        : 'translated_document.xlsx';

      // Save file
      writeFile(wb, exportFileName);
    } catch (error) {
      console.error('Export error:', error);
      setError('Error exporting file. Please try again.');
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom align="center">
          Excel Translator {CONFIG.ICON_TRANSLATION}
        </Typography>
        
        <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 4 }}>
          <Button
            variant="contained"
            component="label"
            startIcon={<CloudUploadIcon />}
            disabled={loading}
          >
            Upload Excel File
            <input
              type="file"
              hidden
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
            />
          </Button>

          {data.length > 0 && (
            <Button
              variant="contained"
              color="success"
              startIcon={<DownloadIcon />}
              onClick={handleExport}
              disabled={loading}
            >
              Download Translated File
            </Button>
          )}
        </Stack>

        {loading && (
          <Box sx={{ width: '100%', mb: 4 }}>
            <LinearProgress variant="determinate" value={progress} />
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
              Translating... {Math.round(progress)}%
            </Typography>
          </Box>
        )}

        {data.length > 0 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Original Text</TableCell>
                  <TableCell>Persian Translation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row.original}</TableCell>
                    <TableCell dir="rtl">{row.translated}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Snackbar 
          open={!!error} 
          autoHideDuration={6000} 
          onClose={() => setError('')}
        >
          <Alert 
            onClose={() => setError('')} 
            severity="error" 
            sx={{ width: '100%' }}
          >
            {error}
          </Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
}; 
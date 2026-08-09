// Local ML Inference Engine (Naive Bayes + TF-IDF)

import { Transaction } from '../types';
import { categorizeNoteWithArcticFTS5 } from './semanticClassifier';

export interface InferenceResult {
  categoryId: string | null;
  paymentMethod: string | null;
  confidence: number;
}

// In-memory trained model
let categoryWordCounts: Record<string, Record<string, number>> = {};
let categoryTotals: Record<string, number> = {};
let totalWords = 0;

let paymentWordCounts: Record<string, Record<string, number>> = {};
let paymentTotals: Record<string, number> = {};
let totalPaymentWords = 0;

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/**
 * Trains the Naive Bayes model on the user's historical transactions.
 * Extremely fast, runs in milliseconds on startup.
 */
export function trainModel(transactions: Transaction[]) {
  // Reset
  categoryWordCounts = {};
  categoryTotals = {};
  totalWords = 0;
  
  paymentWordCounts = {};
  paymentTotals = {};
  totalPaymentWords = 0;

  for (const tx of transactions) {
    if (!tx.note) continue;
    const tokens = tokenize(tx.note);
    
    // Train Category
    if (!categoryWordCounts[tx.categoryId]) {
      categoryWordCounts[tx.categoryId] = {};
      categoryTotals[tx.categoryId] = 0;
    }
    
    for (const token of tokens) {
      categoryWordCounts[tx.categoryId][token] = (categoryWordCounts[tx.categoryId][token] || 0) + 1;
      categoryTotals[tx.categoryId]++;
      totalWords++;
    }

    // Train Payment Method
    if (tx.paymentMethod) {
      if (!paymentWordCounts[tx.paymentMethod]) {
        paymentWordCounts[tx.paymentMethod] = {};
        paymentTotals[tx.paymentMethod] = 0;
      }
      for (const token of tokens) {
        paymentWordCounts[tx.paymentMethod][token] = (paymentWordCounts[tx.paymentMethod][token] || 0) + 1;
        paymentTotals[tx.paymentMethod]++;
        totalPaymentWords++;
      }
    }
  }
}

/**
 * Predicts category and payment method based on historical patterns.
 */
export function predict(query: string): InferenceResult {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { categoryId: null, paymentMethod: null, confidence: 0 };

  // 1. Predict Category
  let bestCategory: string | null = null;
  let bestCatScore = -Infinity;
  let secondBestCatScore = -Infinity;
  const categories = Object.keys(categoryWordCounts);

  if (categories.length > 0) {
    for (const cat of categories) {
      // Prior probability log(P(c))
      let score = Math.log(categoryTotals[cat] / totalWords);
      
      for (const token of tokens) {
        // Laplace smoothing
        const count = categoryWordCounts[cat][token] || 0;
        const prob = (count + 1) / (categoryTotals[cat] + Object.keys(categoryWordCounts[cat]).length + 1);
        score += Math.log(prob);
      }

      if (score > bestCatScore) {
        secondBestCatScore = bestCatScore;
        bestCatScore = score;
        bestCategory = cat;
      } else if (score > secondBestCatScore) {
        secondBestCatScore = score;
      }
    }
  }

  // 2. Predict Payment Method
  let bestPayment: string | null = null;
  let bestPayScore = -Infinity;
  const payments = Object.keys(paymentWordCounts);

  if (payments.length > 0) {
    for (const pay of payments) {
      let score = Math.log(paymentTotals[pay] / totalPaymentWords);
      for (const token of tokens) {
        const count = paymentWordCounts[pay][token] || 0;
        const prob = (count + 1) / (paymentTotals[pay] + Object.keys(paymentWordCounts[pay]).length + 1);
        score += Math.log(prob);
      }

      if (score > bestPayScore) {
        bestPayScore = score;
        bestPayment = pay;
      }
    }
  }

  // Calculate dynamic confidence based on training dataset size & top score margin
  let confidence = 50;
  if (bestCategory) {
    const trainingSize = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
    const dataConfidence = Math.min(85, 40 + Math.floor(trainingSize / 10));
    const margin = bestCatScore - secondBestCatScore;
    const marginConfidence = margin > 2 ? 85 : margin > 1 ? 70 : 55;
    confidence = Math.min(dataConfidence, marginConfidence);
  } else {
    const semanticFallback = categorizeNoteWithArcticFTS5(query);
    bestCategory = semanticFallback.categoryId;
    confidence = semanticFallback.confidence;
  }

  return {
    categoryId: bestCategory,
    paymentMethod: bestPayment,
    confidence
  };
}

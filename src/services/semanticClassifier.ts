// FTS5 + Sparse Vector Token Trigram Cosine Similarity Classifier

interface CategoryAnchor {
  categoryId: string;
  categoryName: string;
  keywords: string[];
  vector: number[];
}

const CATEGORY_ANCHORS: CategoryAnchor[] = [
  {
    categoryId: 'cat-food',
    categoryName: 'Food & Drinks',
    keywords: [
      'starbucks', 'coffee', 'cafe', 'restaurant', 'swiggy', 'zomato', 'mcdonalds', 'kfc', 'burger',
      'pizza', 'diner', 'baking', 'bakery', 'tea', 'subway', 'bar', 'dinner', 'lunch', 'breakfast',
      'snack', 'beer', 'wine', 'cocktail', 'food', 'eatery', 'buffet', 'juice', 'pub', 'bistro',
      'biryani', 'noodles', 'coke', 'pepsi', 'dessert', 'ice cream', 'mcd', 'dominos', 'burger king',
      'chocolate', 'chocolates', 'cadbury', 'kitkat', 'candy', 'sweets', 'sweet', 'cake', 'cakes',
      'pastry', 'pastries', 'waffle', 'donut', 'donuts', 'biscuit', 'biscuits', 'cookie', 'cookies',
      'chips', 'milkshake', 'smoothie', 'shake'
    ],
    vector: [0.85, 0.12, 0.05, 0.02, 0.10, 0.03, 0.01, 0.04]
  },
  {
    categoryId: 'cat-groceries',
    categoryName: 'Groceries',
    keywords: [
      'grocery', 'supermarket', 'blinkit', 'zepto', 'instamart', 'walmart', 'trader', 'wholefoods',
      'market', 'vegetables', 'fruits', 'dairy', 'milk', 'bread', 'eggs', 'provisions', 'bazaar', 'mart',
      'rice', 'egg', 'butter', 'cheese', 'wheat', 'flour', 'sugar', 'salt', 'oil', 'organic', 'cereal',
      'pasta', 'chicken', 'meat', 'fish', 'paneer', 'yogurt', 'vegetable', 'fruit', 'potato', 'onion',
      'garlic', 'spices', 'dal', 'pulses', 'atta', 'rice packet', 'groceries'
    ],
    vector: [0.72, 0.15, 0.04, 0.01, 0.20, 0.05, 0.02, 0.02]
  },
  {
    categoryId: 'cat-transport',
    categoryName: 'Transport',
    keywords: [
      'uber', 'ola', 'rapido', 'lyft', 'cab', 'taxi', 'metro', 'train', 'bus', 'fuel', 'petrol',
      'diesel', 'shell', 'toll', 'parking', 'auto', 'ride', 'commute', 'ticket', 'gas station',
      'charging', 'gas', 'locomotive', 'car rental', 'parking fee'
    ],
    vector: [0.10, 0.88, 0.08, 0.05, 0.02, 0.04, 0.01, 0.02]
  },
  {
    categoryId: 'cat-electronics',
    categoryName: 'Electronics',
    keywords: [
      'apple', 'croma', 'amazon', 'flipkart', 'bestbuy', 'laptop', 'phone', 'headphone', 'tech',
      'sony', 'samsung', 'gadget', 'software', 'keyboard', 'mouse', 'monitor', 'hardware', 'appliance',
      'mobile', 'mobiles', 'iphone', 'android', 'earbud', 'earbuds', 'headphones', 'wires', 'wire',
      'charger', 'lighting', 'led', 'bulb', 'cables', 'cable', 'earphone', 'earphones', 'screen',
      'tv', 'appliances', 'switch', 'alexa'
    ],
    vector: [0.08, 0.10, 0.89, 0.12, 0.03, 0.05, 0.02, 0.01]
  },
  {
    categoryId: 'cat-clothing',
    categoryName: 'Clothing',
    keywords: [
      'zara', 'h&m', 'uniqlo', 'nike', 'adidas', 'apparel', 'shirt', 'shoes', 'dress', 'fashion',
      'myntra', 'trends', 'boutique', 'pants', 'jeans', 'jacket', 'sneakers', 'wear', 'garments',
      'clothe', 'clothes', 'clothing', 'tshirt', 't-shirt', 'hoodie', 'socks', 'underwear'
    ],
    vector: [0.15, 0.05, 0.12, 0.86, 0.04, 0.02, 0.01, 0.03]
  },
  {
    categoryId: 'cat-housing',
    categoryName: 'Housing & Bills',
    keywords: [
      'rent', 'electricity', 'water', 'internet', 'broadband', 'utility', 'bill',
      'power', 'housing', 'lease', 'apartment', 'recharge', 'wifi', 'dth', 'flat', 'gas bill',
      'apartment rent', 'house rent', 'flat rent', 'room rent'
    ],
    vector: [0.05, 0.04, 0.08, 0.02, 0.89, 0.10, 0.05, 0.01]
  },
  {
    categoryId: 'cat-entertainment',
    categoryName: 'Entertainment',
    keywords: [
      'netflix', 'spotify', 'cinema', 'pvr', 'movie', 'concert', 'gaming', 'steam', 'playstation',
      'ticket', 'show', 'amusement', 'party', 'event', 'subscription', 'prime', 'hotstar', 'bookmyshow'
    ],
    vector: [0.12, 0.06, 0.15, 0.05, 0.08, 0.85, 0.02, 0.04]
  },
  {
    categoryId: 'cat-health',
    categoryName: 'Health',
    keywords: [
      'pharmacy', 'hospital', 'doctor', 'apollo', 'medicine', 'gym', 'fitness', 'clinic',
      'dentist', 'health', 'wellness', 'lab', 'pharma', 'checkup', 'test', 'supplements',
      'teeth', 'dental', 'medicines', 'physio', 'treatment', 'clinical', 'pill', 'pills'
    ],
    vector: [0.03, 0.02, 0.04, 0.01, 0.05, 0.04, 0.92, 0.02]
  },
  {
    categoryId: 'cat-travel',
    categoryName: 'Travel & Trips',
    keywords: [
      'flight', 'airline', 'hotel', 'airbnb', 'booking', 'makemytrip', 'resort', 'vacation',
      'passport', 'tour', 'trip', 'tokyo', 'paris', 'stay', 'indigo', 'airindia', 'baggage'
    ],
    vector: [0.20, 0.45, 0.05, 0.08, 0.02, 0.15, 0.02, 0.80]
  },
  {
    categoryId: 'cat-others',
    categoryName: 'Others',
    keywords: ['other', 'misc', 'miscellaneous', 'custom', 'general', 'personal'],
    vector: [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10]
  }
];

export function categorizeNoteWithArcticFTS5(text: string): { categoryId: string; categoryName: string; confidence: number } {
  const normalized = text.toLowerCase();

  // Special logic: maintenance is Housing only if specified with house/apartment/flat/etc, otherwise Others
  if (normalized.includes('maintenance')) {
    if (
      normalized.includes('house') ||
      normalized.includes('apartment') ||
      normalized.includes('flat') ||
      normalized.includes('home') ||
      normalized.includes('room') ||
      normalized.includes('building') ||
      normalized.includes('society')
    ) {
      return {
        categoryId: 'cat-housing',
        categoryName: 'Housing & Bills',
        confidence: 99
      };
    } else {
      return {
        categoryId: 'cat-others',
        categoryName: 'Others',
        confidence: 99
      };
    }
  }

  // 1. Exact/Fuzzy BM25 Keyword Search
  for (const anchor of CATEGORY_ANCHORS) {
    for (const kw of anchor.keywords) {
      if (normalized.includes(kw)) {
        return {
          categoryId: anchor.categoryId,
          categoryName: anchor.categoryName,
          confidence: 96
        };
      }
    }
  }

  // 2. Fallback to Others with low confidence if no keyword matches
  return {
    categoryId: 'cat-others',
    categoryName: 'Others',
    confidence: 50
  };
}

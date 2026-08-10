export interface CategoryAnchor {
  categoryId: string;
  categoryName: string;
  keywords: string[];
}

export const CATEGORY_ANCHORS: CategoryAnchor[] = [
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
    ]
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
    ]
  },
  {
    categoryId: 'cat-transport',
    categoryName: 'Transport',
    keywords: [
      'uber', 'ola', 'rapido', 'lyft', 'cab', 'taxi', 'metro', 'train', 'bus', 'fuel', 'petrol',
      'diesel', 'shell', 'toll', 'parking', 'auto', 'ride', 'commute', 'ticket', 'gas station',
      'charging', 'gas', 'locomotive', 'car rental', 'parking fee'
    ]
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
    ]
  },
  {
    categoryId: 'cat-clothing',
    categoryName: 'Clothing',
    keywords: [
      'zara', 'h&m', 'uniqlo', 'nike', 'adidas', 'apparel', 'shirt', 'shoes', 'dress', 'fashion',
      'myntra', 'trends', 'boutique', 'pants', 'jeans', 'jacket', 'sneakers', 'wear', 'garments',
      'clothe', 'clothes', 'clothing', 'tshirt', 't-shirt', 'hoodie', 'socks', 'underwear'
    ]
  },
  {
    categoryId: 'cat-housing',
    categoryName: 'Housing & Bills',
    keywords: [
      'rent', 'electricity', 'water bill', 'water utility', 'water charge', 'internet', 'broadband', 'utility', 'bill',
      'power', 'housing', 'lease', 'apartment', 'recharge', 'wifi', 'dth', 'flat', 'gas bill',
      'apartment rent', 'house rent', 'flat rent', 'room rent'
    ]
  },
  {
    categoryId: 'cat-entertainment',
    categoryName: 'Entertainment',
    keywords: [
      'netflix', 'spotify', 'cinema', 'pvr', 'movie', 'concert', 'gaming', 'steam', 'playstation',
      'ticket', 'show', 'amusement', 'party', 'event', 'subscription', 'prime', 'hotstar', 'bookmyshow'
    ]
  },
  {
    categoryId: 'cat-health',
    categoryName: 'Health',
    keywords: [
      'pharmacy', 'hospital', 'doctor', 'apollo', 'medicine', 'gym', 'fitness', 'clinic',
      'dentist', 'health', 'wellness', 'lab', 'pharma', 'checkup', 'test', 'supplements',
      'teeth', 'dental', 'medicines', 'physio', 'treatment', 'clinical', 'pill', 'pills'
    ]
  },
  {
    categoryId: 'cat-travel',
    categoryName: 'Travel & Trips',
    keywords: [
      'flight', 'airline', 'hotel', 'airbnb', 'booking', 'makemytrip', 'resort', 'vacation',
      'passport', 'tour', 'trip', 'tokyo', 'paris', 'stay', 'indigo', 'airindia', 'baggage'
    ]
  },
  {
    categoryId: 'cat-others',
    categoryName: 'Others',
    keywords: ['other', 'misc', 'miscellaneous', 'custom', 'general', 'personal']
  }
];

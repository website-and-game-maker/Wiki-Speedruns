/* Curated pool of well-known articles for Daily and Random challenges.
 * Popular pages make for fair, fun runs — truly random Wikipedia pages are mostly village stubs. */
(function (root) {
  const WS = (root.WS = root.WS || {});

  const POOL = {
    People: [
      'Albert Einstein', 'Isaac Newton', 'Marie Curie', 'Charles Darwin', 'Leonardo da Vinci', 'William Shakespeare',
      'Napoleon', 'Cleopatra', 'Julius Caesar', 'Genghis Khan', 'Abraham Lincoln', 'Mahatma Gandhi', 'Nelson Mandela',
      'Martin Luther King Jr.', 'Queen Victoria', 'Elizabeth II', 'Winston Churchill', 'Ada Lovelace', 'Alan Turing',
      'Nikola Tesla', 'Thomas Edison', 'Galileo Galilei', 'Aristotle', 'Plato', 'Confucius', 'Wolfgang Amadeus Mozart',
      'Ludwig van Beethoven', 'Johann Sebastian Bach', 'Pablo Picasso', 'Vincent van Gogh', 'Frida Kahlo', 'Michael Jackson',
      'Elvis Presley', 'The Beatles', 'Taylor Swift', 'Beyoncé', 'Serena Williams', 'Muhammad Ali', 'Michael Jordan',
      'Lionel Messi', 'Cristiano Ronaldo', 'Usain Bolt', 'Walt Disney', 'Steve Jobs', 'Bill Gates', 'Elon Musk',
      'Oprah Winfrey', 'Stephen Hawking', 'Sigmund Freud', 'Karl Marx', 'Joan of Arc', 'Alexander the Great',
      'Marco Polo', 'Christopher Columbus', 'Neil Armstrong', 'Amelia Earhart', 'Frederick Douglass', 'Harriet Tubman',
      'Jane Austen', 'Charles Dickens', 'Mark Twain', 'J. K. Rowling', 'Agatha Christie', 'Homer',
    ],
    Places: [
      'Paris', 'London', 'New York City', 'Tokyo', 'Rome', 'Cairo', 'Istanbul', 'Sydney', 'Rio de Janeiro', 'Mumbai',
      'Beijing', 'Moscow', 'Venice', 'Antarctica', 'Mount Everest', 'Sahara', 'Amazon rainforest', 'Great Barrier Reef',
      'Grand Canyon', 'Iceland', 'Japan', 'Brazil', 'Australia', 'Canada', 'Egypt', 'India', 'Mexico', 'Greece',
      'New Zealand', 'Madagascar', 'Hawaii', 'Alaska', 'Las Vegas', 'Hollywood', 'Silicon Valley', 'Mars', 'Moon',
      'Sun', 'Jupiter', 'Pacific Ocean', 'Nile', 'Mississippi River', 'Atlantis', 'Machu Picchu', 'Stonehenge',
      'Eiffel Tower', 'Great Wall of China', 'Taj Mahal', 'Colosseum', 'Statue of Liberty', 'Pyramid of Giza',
      'Vatican City', 'Monaco', 'Singapore', 'Dubai', 'Yellowstone National Park', 'Niagara Falls', 'Chernobyl disaster',
    ],
    Science: [
      'Black hole', 'Big Bang', 'DNA', 'Photosynthesis', 'Evolution', 'Gravity', 'Quantum mechanics', 'Theory of relativity',
      'Periodic table', 'Atom', 'Electricity', 'Magnetism', 'Volcano', 'Earthquake', 'Tsunami', 'Climate change',
      'Plate tectonics', 'Dinosaur', 'Tyrannosaurus', 'Human brain', 'Heart', 'Vaccine', 'Penicillin', 'COVID-19 pandemic',
      'Virus', 'Bacteria', 'Cell (biology)', 'Photon', 'Speed of light', 'Pi', 'Prime number', 'Zero', 'Infinity',
      'Fibonacci sequence', 'Algorithm', 'Artificial intelligence', 'Internet', 'World Wide Web', 'Computer', 'Smartphone',
      'Bitcoin', 'Laser', 'Nuclear power', 'Solar System', 'Milky Way', 'International Space Station', 'Apollo 11',
      'Hubble Space Telescope', 'Rainbow', 'Aurora', 'Lightning', 'Oxygen', 'Water', 'Gold', 'Diamond', 'Iron',
    ],
    Nature: [
      'Cat', 'Dog', 'Horse', 'Elephant', 'Lion', 'Tiger', 'Giant panda', 'Polar bear', 'Blue whale', 'Dolphin', 'Shark',
      'Octopus', 'Penguin', 'Eagle', 'Owl', 'Honey bee', 'Ant', 'Butterfly', 'Spider', 'Snake', 'Crocodile', 'Kangaroo',
      'Koala', 'Giraffe', 'Gorilla', 'Chimpanzee', 'Wolf', 'Fox', 'Rabbit', 'Chicken', 'Frog', 'Tardigrade', 'Coral reef',
      'Oak', 'Rose', 'Sunflower', 'Bamboo', 'Cactus', 'Mushroom', 'Banana', 'Apple', 'Coffee', 'Tea', 'Chocolate',
    ],
    Culture: [
      'Pizza', 'Sushi', 'Hamburger', 'Ice cream', 'Cheese', 'Bread', 'Beer', 'Wine', 'Olympic Games', 'FIFA World Cup',
      'Super Bowl', 'Chess', 'Basketball', 'Association football', 'Cricket', 'Tennis', 'Baseball', 'Golf', 'Skateboarding',
      'Harry Potter', 'The Lord of the Rings', 'Star Wars', 'Star Trek', 'Game of Thrones', 'The Simpsons', 'Pokémon',
      'Super Mario', 'Minecraft', 'Tetris', 'The Legend of Zelda', 'Batman', 'Superman', 'Spider-Man', 'Mickey Mouse',
      'Godzilla', 'Titanic (1997 film)', 'The Godfather', 'Mona Lisa', 'The Starry Night', 'Jazz', 'Hip hop music',
      'Rock music', 'Opera', 'Ballet', 'Piano', 'Guitar', 'Violin', 'Christmas', 'Halloween', 'Chinese New Year',
      'Diwali', 'Lego', 'Barbie', 'Rubik\'s Cube', 'Monopoly (game)', 'Dungeons & Dragons', 'Anime', 'K-pop', 'Emoji',
    ],
    History: [
      'World War I', 'World War II', 'Cold War', 'Roman Empire', 'Ancient Egypt', 'Ancient Greece', 'Vikings',
      'Middle Ages', 'Renaissance', 'Industrial Revolution', 'French Revolution', 'American Revolution', 'Black Death',
      'Titanic', 'Moon landing', 'Fall of the Berlin Wall', 'Printing press', 'Silk Road', 'Aztecs', 'Inca Empire',
      'Mongol Empire', 'Ottoman Empire', 'British Empire', 'Samurai', 'Knight', 'Pirate', 'Great Depression',
      'Space Race', 'United Nations', 'European Union', 'Democracy', 'Magna Carta', 'Declaration of Independence',
      'Wright brothers', 'Steam engine', 'Wheel', 'Writing', 'Money', 'Olympia, Greece',
    ],
    Things: [
      'Automobile', 'Bicycle', 'Airplane', 'Train', 'Rocket', 'Submarine', 'Ship', 'Telephone', 'Television', 'Radio',
      'Camera', 'Clock', 'Book', 'Paper', 'Glass', 'Plastic', 'Umbrella', 'Toilet', 'Refrigerator', 'Light bulb',
      'Robot', 'Video game', 'Sword', 'Castle', 'Skyscraper', 'Bridge', 'Library', 'Museum', 'University', 'Hospital',
    ],
  };

  const ALL = [];
  for (const [cat, list] of Object.entries(POOL)) for (const t of list) ALL.push({ title: t, category: cat });

  WS.articles = {
    POOL,
    ALL,
    /** Two distinct articles from different categories, from a [0,1) random source. */
    pickPair(rand = Math.random) {
      const a = ALL[Math.floor(rand() * ALL.length)];
      let b;
      for (let i = 0; i < 50; i++) {
        b = ALL[Math.floor(rand() * ALL.length)];
        if (b.title !== a.title && b.category !== a.category) break;
      }
      return [a.title, b.title];
    },
    /** Same pair for everyone on a given UTC date. */
    dailyPair(dateKey) {
      return this.pickPair(WS.util.rng(WS.util.hash('wiki-speedruns-daily:' + dateKey)));
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

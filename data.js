// Catalog. Prices are per bottle, VAT included. Boxes of 6 only.
window.WINES = [
  {
    id: 'branco',
    name: 'Ferradosa',
    sub: 'Branco',
    year: '2022',
    img: 'assets/wines/ferradosa-branco.png',
    price: 17.45,
    stock: true,
  },
  {
    id: 'rose',
    name: 'Ferradosa',
    sub: 'Rosé',
    year: '2024',
    img: 'assets/wines/ferradosa-rose.png',
    price: 10.45,
    stock: true,
  },
  {
    id: 'quinta',
    name: 'Quinta da Ferradosa',
    sub: 'Tinto',
    year: '2021',
    img: 'assets/wines/quinta-da-ferradosa.png',
    price: 17.95,
    stock: false,
  },
  {
    id: 'tinto',
    name: 'Ferradosa',
    sub: 'Tinto',
    year: '2019',
    img: 'assets/wines/ferradosa-tinto.png',
    price: 26.95,
    stock: true,
  },
];

window.BOTTLES_PER_BOX = 6;
window.fmtEUR = (n) => '€' + n.toFixed(2).replace('.', ',');
window.boxPrice = (perBottle) => perBottle * window.BOTTLES_PER_BOX;

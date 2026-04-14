export default function handler(req, res) {
  res.status(200).json({ 
    status: 'OK', 
    architecture: 'native-isolated',
    message: 'Esta é uma função sem nenhuma dependência externa.'
  });
}

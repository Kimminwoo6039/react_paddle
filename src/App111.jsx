import  { useState } from 'react';
import * as ocr from '@paddle-js-models/ocr';


const App = () => {
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleOcr = async () => {
    ocr.init({modelPath:'https://paddlejs.bj.bcebos.com/models/fuse/ocr/ch_PP-OCRv3_det_fuse_activation/model.json'})
    // const ocr = new AAA({
    //   modelPath: 'https://paddlejs.bj.bcebos.com/models/fuse/ocr/ch_PP-OCRv3_det_fuse_activation/model.json' // 변환된 모델 경로
    // });

    //await ocr.load(); // 모델 로드
    const ocrResult = await ocr.recognize(image); // OCR 수행
    setResult(ocrResult); // 결과 설정
  };

  return (
      <div>
        <h1>Paddle.js OCR in React</h1>
        <input type="file" accept="image/*" onChange={handleImageChange} />
        {image && (
            <div>
              <img src={image} alt="Uploaded" width="300" />
              <button onClick={handleOcr}>OCR 시작</button>
            </div>
        )}
        {result && (
            <div>
              <h2>OCR 결과:</h2>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
        )}
      </div>
  );
};

export default App;

import { useEffect, useRef, useState } from 'react';
 import * as ocr from "../src/index.ts";
 //  import * as ocr from "@paddlejs-models/ocr";


const App = () => {
  const [result, setResult] = useState('');
  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const canvasRef = useRef(null);
  const showImgRef = useRef(null);
  const rawImgRef = useRef(null);



  useEffect(() => {

    const initModel = async () => {
      try {
        canvasRef.current = document.getElementById('canvas');
        // await ocr.init({
        //   // detCustomModel: 'https://paddlejs.bj.bcebos.com/models/fuse/ocr/ch_PP-OCRv3_det_fuse_activation/model.json',  // 검출 모델 사용자 정의 경로
        //   // recCustomModel: 'https://paddlejs.bj.bcebos.com/models/fuse/ocr/ch_PP-OCRv3_det_fuse_activation/model.json'   // 인식 모델 사용자 정의 경로
        // });
      await ocr.init()

        setIsLoadingModel(false);
      } catch (error) {
        console.error("Error initializing OCR model:", error);
      }
    };

    initModel();

    return () => {
      console.log('Cleanup resources');
    };
  }, []);

  const uploadImg = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    if (file) {
      reader.onload = () => {
        const imgUrl = URL.createObjectURL(file);
        showImgRef.current.src = imgUrl;
        rawImgRef.current.src = imgUrl;
      };
      reader.readAsDataURL(file);
    }
  };


  const predict = async () => {
    const img = rawImgRef.current;
    console.log("이미지" , img)
    const res = await ocr.recognize(img, { canvas: canvasRef.current  });
    console.log("res =" , res)

    //const recResult = new recPostprocess(canvasRef);
    console.log("음")
    console.log(res)
    if (res.text?.length) {
      setResult(res.text.reduce((total, cur) => total + `<p>${cur}</p>`));
    }
  };

  return (
      <div style={{ padding: '20px' , justifyContent:"center"  }}>
        {isLoadingModel && (
            <div style={{ marginBottom: '20px' }}>
              <h2>테스트</h2>
              <p>이미지 OCR 테스트</p>
            </div>
        )}
        <div style={{ display: 'flex', gap: '20px' }}>
          <div style={{ flex: '1' }}>
            <h2>이미지 등록</h2>
            <input type="file" onChange={uploadImg} alt="입력" />
            <div>
              <img ref={showImgRef} style={{ width: '100%', marginTop: '10px' }} alt="Preview" />
              <img ref={rawImgRef} style={{ display: 'none' }} alt="Raw" />
            </div>
          </div>
          <div style={{ flex: '1' }}>
            <h2>이미지 박스</h2>
            <button onClick={predict}>결과 조회</button>
            <canvas id="canvas"></canvas>
          </div>
          <div style={{ flex: '1' }}>
            <h2>이미지 결과</h2>
            <div dangerouslySetInnerHTML={{ __html: result }} />
          </div>
        </div>
      </div>
  );
};

export default App;

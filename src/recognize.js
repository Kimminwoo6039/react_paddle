import {CanvasStyleOptions} from "@paddle-js-models/ocr/lib";

export async function recognize(image, options) {
  // 텍스트 박스 좌표점 감지
  const point = await detect(image);

  // 캔버스에 텍스트 박스 그리기
  if (options?.canvas) {
    drawBox(point, image, options.canvas, options.style);
  }

  // 박스 정렬
  const boxes = sorted_boxes(point);
  const text_list = [];

  // 박스 내 텍스트 인식
  for (let i = 0; i < boxes.length; i++) {
    const tmp_box = JSON.parse(JSON.stringify(boxes[i]));
    get_rotate_crop_image(image, tmp_box);

    const width_num = Math.ceil(canvas_det.width / RECWIDTH);
    let text_list_tmp = '';

    // 원본 이미지의 폭을 기준으로 자르고 이어붙임
    for (let j = 0; j < width_num; j++) {
      resize_norm_img_splice(canvas_det, canvas_det.width, canvas_det.height, j);
      const output = await recRunner.predict(canvas_rec);
      const recResult = new RecProcess(output);
      const text = recResult.outputResult();
      text_list_tmp = text_list_tmp.concat(text.text);
    }

    text_list.push(text_list_tmp);
  }

  return { text: text_list, points: point };
}


async function detect(image) {
  // 目标尺寸
  const targetWidth = DETSHAPE;
  const targetHeight = DETSHAPE;
  canvas_det.width = targetWidth;
  canvas_det.height = targetHeight;
  // 通过canvas将上传原图大小转换为目标尺寸
  const ctx = canvas_det.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, targetHeight, targetWidth);
  // 缩放后的宽高
  let sw = targetWidth;
  let sh = targetHeight;
  let x = 0;
  let y = 0;
  // target的长宽比大些 就把原图的高变成target那么高
  if (targetWidth / targetHeight * image.naturalHeight / image.naturalWidth >= 1) {
    sw = Math.round(sh * image.naturalWidth / image.naturalHeight);
    x = Math.floor((targetWidth - sw) / 2);
  }
  // target的长宽比小些 就把原图的宽变成target那么宽
  else {
    sh = Math.round(sw * image.naturalHeight / image.naturalWidth);
    y = Math.floor((targetHeight - sh) / 2);
  }
  ctx.drawImage(image, x, y, sw, sh);
  const shapeList = [DETSHAPE, DETSHAPE];
  const outsDict = await detectRunner.predict(canvas_det);
  const postResult = new DBProcess(outsDict, shapeList);
  // 获取坐标
  const result = postResult.outputBox();
  // 转换原图坐标
  const points = JSON.parse(JSON.stringify(result.boxes));
  // 框选调整大小
  const adjust = 8;
  points && points.forEach(item => {
    item.forEach((point, index) => {
      // 扩大框选区域，便于文字识别
      point[0] = clip(
          (Math.round(point[0] - x) * Math.max(image.naturalWidth, image.naturalHeight) / DETSHAPE)
          + (index === 0 ? -adjust : index === 1 ? adjust : index === 2 ? adjust : -adjust),
          0,
          image.naturalWidth
      );
      point[1] = clip(
          (Math.round(point[1] - y) * Math.max(image.naturalWidth, image.naturalHeight) / DETSHAPE)
          + (index === 0 ? -adjust : index === 1 ? -adjust : index === 2 ? adjust : adjust),
          0,
          image.naturalHeight
      );
    });
  });
  return points;
}

function drawBox(
    points: number[],
    image: HTMLImageElement,
    canvas: HTMLCanvasElement,
    style?: CanvasStyleOptions
) {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  points && points.forEach(point => {
    // 开始一个新的绘制路径
    ctx.beginPath();
    // 设置绘制线条颜色，默认为黑色
    ctx.strokeStyle = style?.strokeStyle || '#000';
    // 设置线段宽度，默认为1
    ctx.lineWidth = style?.lineWidth || 1;
    // 设置填充颜色，默认透明
    ctx.fillStyle = style?.fillStyle || 'transparent';
    // 设置路径起点坐标
    ctx.moveTo(point[0][0], point[0][1]);
    ctx.lineTo(point[1][0], point[1][1]);
    ctx.lineTo(point[2][0], point[2][1]);
    ctx.lineTo(point[3][0], point[3][1]);
    // 进行内容填充
    ctx.fill();
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  });
}
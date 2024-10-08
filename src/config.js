import { Runner, env } from '@paddlejs/paddlejs-core';
import '@paddlejs/paddlejs-backend-webgl';
import DBProcess from './dbPostprocess';
import RecProcess from './recPostprocess';
import cv from '@paddlejs-mediapipe/opencv/library/opencv_ocr';
import { flatten, int, clip } from './util';

let DETSHAPE = 960;
let RECWIDTH = 320;
const RECHEIGHT = 32;
const canvas_det = document.createElement('canvas');
const canvas_rec = document.createElement('canvas');
let detectRunner = null;
let recRunner = null;

initCanvas(canvas_det);
initCanvas(canvas_rec);

function initCanvas(canvas) {
  canvas.style.position = 'fixed';
  canvas.style.bottom = '0';
  canvas.style.zIndex = '-1';
  canvas.style.opacity = '0';
  document.body.appendChild(canvas);
}

export async function init(detCustomModel = null, recCustomModel = null) {
  const detModelPath = 'https://paddlejs.bj.bcebos.com/models/fuse/ocr/ch_PP-OCRv3_det_fuse_activation/model.json';
  const recModelPath = 'https://paddlejs.bj.bcebos.com/models/fuse/ocr/ch_PP-OCRv2_rec_fuse_activation/model.json';
  env.set('webgl_pack_output', true);
  detectRunner = new Runner({
    modelPath: detCustomModel ? detCustomModel : detModelPath,
    fill: '#fff',
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    bgr: true,
    webglFeedProcess: true
  });
  const detectInit = detectRunner.init();

  recRunner = new Runner({
    modelPath: recCustomModel ? recCustomModel : recModelPath,
    fill: '#000',
    mean: [0.5, 0.5, 0.5],
    std: [0.5, 0.5, 0.5],
    bgr: true,
    webglFeedProcess: true
  });
  const recInit = recRunner.init();

  await Promise.all([detectInit, recInit]);

  if (detectRunner.feedShape) {
    DETSHAPE = detectRunner.feedShape.fw;
  }
  if (recRunner.feedShape) {
    RECWIDTH = recRunner.feedShape.fw;
  }
}

async function detect(image) {
  const targetWidth = DETSHAPE;
  const targetHeight = DETSHAPE;
  canvas_det.width = targetWidth;
  canvas_det.height = targetHeight;

  const ctx = canvas_det.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, targetHeight, targetWidth);

  let sw = targetWidth;
  let sh = targetHeight;
  let x = 0;
  let y = 0;

  if (targetWidth / targetHeight * image.naturalHeight / image.naturalWidth >= 1) {
    sw = Math.round(sh * image.naturalWidth / image.naturalHeight);
    x = Math.floor((targetWidth - sw) / 2);
  } else {
    sh = Math.round(sw * image.naturalHeight / image.naturalWidth);
    y = Math.floor((targetHeight - sh) / 2);
  }

  ctx.drawImage(image, x, y, sw, sh);
  const shapeList = [DETSHAPE, DETSHAPE];
  const outsDict = await detectRunner.predict(canvas_det);
  const postResult = new DBProcess(outsDict, shapeList);
  const result = postResult.outputBox();
  const points = JSON.parse(JSON.stringify(result.boxes));

  const adjust = 8;
  points.forEach(item => {
    item.forEach((point, index) => {
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

function drawBox(points, image, canvas, style) {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  points.forEach(point => {
    ctx.beginPath();
    ctx.strokeStyle = style?.strokeStyle || '#000';
    ctx.lineWidth = style?.lineWidth || 1;
    ctx.fillStyle = style?.fillStyle || 'transparent';
    ctx.moveTo(point[0][0], point[0][1]);
    ctx.lineTo(point[1][0], point[1][1]);
    ctx.lineTo(point[2][0], point[2][1]);
    ctx.lineTo(point[3][0], point[3][1]);
    ctx.fill();
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  });
}

export async function recognize(image, options) {
  console.log("안녕")
  const point = await detect(image);
  if (options?.canvas) {
    drawBox(point, image, options.canvas, options.style);
  }

  const boxes = sorted_boxes(point);
  const text_list = [];
  for (let i = 0; i < boxes.length; i++) {
    const tmp_box = JSON.parse(JSON.stringify(boxes[i]));
    get_rotate_crop_image(image, tmp_box);
    const width_num = Math.ceil(canvas_det.width / RECWIDTH);
    let text_list_tmp = '';
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

function sorted_boxes(box) {
  const boxes = box.sort((a, b) => a[0][1] - b[0][1]);
  const num_boxes = boxes.length;
  for (let i = 0; i < num_boxes - 1; i++) {
    if (Math.abs(boxes[i + 1][0][1] - boxes[i][0][1]) < 10
        && boxes[i + 1][0][0] < boxes[i][0][0]) {
      const tmp = boxes[i];
      boxes[i] = boxes[i + 1];
      boxes[i + 1] = tmp;
    }
  }
  return boxes;
}

function get_rotate_crop_image(img, points) {
  const img_crop_width = int(Math.max(
      linalg_norm(points[0], points[1]),
      linalg_norm(points[2], points[3])
  ));
  const img_crop_height = int(Math.max(
      linalg_norm(points[0], points[3]),
      linalg_norm(points[1], points[2])
  ));
  const pts_std = [
    [0, 0],
    [img_crop_width, 0],
    [img_crop_width, img_crop_height],
    [0, img_crop_height]
  ];
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, flatten(points));
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, flatten(pts_std));
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const src = cv.imread(img);
  const dst = new cv.Mat();
  const dsize = new cv.Size(img_crop_width, img_crop_height);
  cv.warpPerspective(src, dst, M, dsize, cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar());
  const dst_img_height = dst.matSize[0];
  const dst_img_width = dst.matSize[1];
  let dst_rot;
  if (dst_img_height / dst_img_width >= 1.5) {
    dst_rot = new cv.Mat();
    const dsize_rot = new cv.Size(dst.rows, dst.cols);
    const center = new cv.Point(dst.cols / 2, dst.cols / 2);
    const M_rot = cv.getRotationMatrix2D(center, 90, 1);
    cv.warpAffine(dst, dst_rot, M_rot, dsize_rot, cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar());
  }

  const dst_resize = new cv.Mat();
  const dsize_resize = new cv.Size(0, 0);
  let scale;
  if (dst_rot) {
    scale = RECHEIGHT / dst_rot.matSize[0];
    cv.resize(dst_rot, dst_resize, dsize_resize, scale, scale, cv.INTER_CUBIC);
    cv.imshow(canvas_rec, dst_resize);
    return canvas_rec;
  }
  scale = RECHEIGHT / dst.matSize[0];
  cv.resize(dst, dst_resize, dsize_resize, scale, scale, cv.INTER_CUBIC);
  cv.imshow(canvas_rec, dst_resize);
  return canvas_rec;
}

function resize_norm_img_splice(img, imgWidth, imgHeight, index) {
  const ctx = canvas_rec.getContext('2d');
  ctx.clearRect(0, 0, RECWIDTH, RECHEIGHT);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, RECWIDTH, RECHEIGHT);
  ctx.drawImage(
      img,
      index * RECWIDTH,
      0,
      RECWIDTH,
      imgHeight,
      0,
      0,
      RECWIDTH,
      RECHEIGHT
  );
}

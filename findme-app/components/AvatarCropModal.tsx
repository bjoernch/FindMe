import { useState, useRef, useCallback } from "react";
import {
  Modal, View, Image, TouchableOpacity, Text, StyleSheet,
  Animated, PanResponder, Dimensions, LayoutChangeEvent,
} from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

const SCREEN = Dimensions.get("window");
const CIRCLE_SIZE = Math.min(SCREEN.width, SCREEN.height) * 0.75;

interface Props {
  imageUri: string;
  visible: boolean;
  onConfirm: (base64: string) => void;
  onCancel: () => void;
}

export function AvatarCropModal({ imageUri, visible, onConfirm, onCancel }: Props) {
  const [imageSize, setImageSize] = useState({ w: 1, h: 1 });
  const [containerSize, setContainerSize] = useState({ w: SCREEN.width, h: SCREEN.height });

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const scaleValue = useRef(1);
  const translateXValue = useRef(0);
  const translateYValue = useRef(0);
  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);
  const initialDistance = useRef(0);
  const isPinching = useRef(false);

  // Track animated values
  scale.addListener(({ value }) => { scaleValue.current = value; });
  translateX.addListener(({ value }) => { translateXValue.current = value; });
  translateY.addListener(({ value }) => { translateYValue.current = value; });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        lastScale.current = scaleValue.current;
        lastTranslateX.current = translateXValue.current;
        lastTranslateY.current = translateYValue.current;

        if (evt.nativeEvent.touches.length === 2) {
          isPinching.current = true;
          const t = evt.nativeEvent.touches;
          initialDistance.current = Math.sqrt(
            (t[0].pageX - t[1].pageX) ** 2 + (t[0].pageY - t[1].pageY) ** 2
          );
        } else {
          isPinching.current = false;
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        if (evt.nativeEvent.touches.length === 2) {
          isPinching.current = true;
          const t = evt.nativeEvent.touches;
          const currentDist = Math.sqrt(
            (t[0].pageX - t[1].pageX) ** 2 + (t[0].pageY - t[1].pageY) ** 2
          );
          if (initialDistance.current > 0) {
            const newScale = Math.max(0.5, Math.min(5, lastScale.current * (currentDist / initialDistance.current)));
            scale.setValue(newScale);
          }
        } else if (!isPinching.current) {
          translateX.setValue(lastTranslateX.current + gestureState.dx);
          translateY.setValue(lastTranslateY.current + gestureState.dy);
        }
      },
      onPanResponderRelease: () => {
        isPinching.current = false;
        // Clamp scale
        const s = scaleValue.current;
        if (s < 1) {
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const onImageLoad = useCallback(() => {
    Image.getSize(imageUri, (w, h) => {
      setImageSize({ w, h });
      // Reset transforms
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
      scaleValue.current = 1;
      translateXValue.current = 0;
      translateYValue.current = 0;
    });
  }, [imageUri, scale, translateX, translateY]);

  const onContainerLayout = (e: LayoutChangeEvent) => {
    setContainerSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  };

  async function handleConfirm() {
    try {
      // Calculate the fitted image dimensions
      const containerW = containerSize.w;
      const containerH = containerSize.h;
      const imgAspect = imageSize.w / imageSize.h;
      const containerAspect = containerW / containerH;

      let fittedW: number, fittedH: number;
      if (imgAspect > containerAspect) {
        fittedW = containerW;
        fittedH = containerW / imgAspect;
      } else {
        fittedH = containerH;
        fittedW = containerH * imgAspect;
      }

      // Scale factor from fitted to original
      const fitScale = imageSize.w / fittedW;

      // Circle center in container coords
      const circleCenterX = containerW / 2;
      const circleCenterY = containerH / 2;

      // Image center in container coords (with transforms)
      const imgCenterX = containerW / 2 + translateXValue.current;
      const imgCenterY = containerH / 2 + translateYValue.current;

      // Circle top-left relative to scaled image
      const s = scaleValue.current;
      const cropX = ((circleCenterX - imgCenterX) / s + fittedW / 2) * fitScale - (CIRCLE_SIZE / 2 / s) * fitScale;
      const cropY = ((circleCenterY - imgCenterY) / s + fittedH / 2) * fitScale - (CIRCLE_SIZE / 2 / s) * fitScale;
      const cropSize = (CIRCLE_SIZE / s) * fitScale;

      // Clamp to image bounds
      const x = Math.max(0, Math.round(cropX));
      const y = Math.max(0, Math.round(cropY));
      const size = Math.min(Math.round(cropSize), imageSize.w - x, imageSize.h - y);

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          { crop: { originX: x, originY: y, width: size, height: size } },
          { resize: { width: 512 } },
        ],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (result.base64) {
        onConfirm(result.base64);
      }
    } catch (err) {
      console.error("Crop error:", err);
      // Fallback: just resize without cropping
      try {
        const result = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 512 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (result.base64) onConfirm(result.base64);
      } catch {
        onCancel();
      }
    }
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Adjust Photo</Text>
          <TouchableOpacity onPress={handleConfirm} style={styles.headerBtn}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cropArea} onLayout={onContainerLayout} {...panResponder.panHandlers}>
          <Animated.Image
            source={{ uri: imageUri }}
            style={[
              styles.image,
              {
                transform: [
                  { translateX },
                  { translateY },
                  { scale },
                ],
              },
            ]}
            resizeMode="contain"
            onLoad={onImageLoad}
          />

          {/* Dark overlay with circular cutout */}
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.overlayTop} />
            <View style={styles.overlayMiddle}>
              <View style={styles.overlaySide} />
              <View style={styles.circle} />
              <View style={styles.overlaySide} />
            </View>
            <View style={styles.overlayBottom} />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.hint}>Drag to move, pinch to zoom</Text>
        </View>
      </View>
    </Modal>
  );
}

const OVERLAY_COLOR = "rgba(0, 0, 0, 0.6)";
const sideWidth = (SCREEN.width - CIRCLE_SIZE) / 2;
const topHeight = (SCREEN.height - CIRCLE_SIZE) / 2 - 60; // account for header

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12,
    backgroundColor: "#000", zIndex: 10,
  },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "600" },
  cancelText: { color: "#aaa", fontSize: 16 },
  doneText: { color: "#3b82f6", fontSize: 16, fontWeight: "600" },
  cropArea: { flex: 1, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { width: "100%", height: topHeight > 0 ? topHeight : 0, backgroundColor: OVERLAY_COLOR },
  overlayMiddle: { flexDirection: "row", height: CIRCLE_SIZE },
  overlaySide: { width: sideWidth, backgroundColor: OVERLAY_COLOR },
  circle: {
    width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.5)",
  },
  overlayBottom: { flex: 1, backgroundColor: OVERLAY_COLOR },
  footer: { paddingVertical: 20, alignItems: "center", backgroundColor: "#000" },
  hint: { color: "#888", fontSize: 14 },
});

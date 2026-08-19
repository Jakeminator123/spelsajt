export interface LabAsset {
  animationUrls: readonly string[];
  fileSize: number;
  id: "dealer-primary" | "patric" | "woman";
  label: string;
  limitations: readonly string[];
  modelUrl: string;
  roleLabel: string;
  targetHeightM: number;
}

export const LAB_ASSETS = [
  {
    animationUrls: [
      "/models/lab-imports/dealer/clips/dealer-primary-v001-clip-idle_11-armature.glb",
      "/models/lab-imports/dealer/clips/dealer-primary-v001-clip-talk_with_left_hand_on_hip-armature.glb",
    ],
    fileSize: 33_047_464,
    id: "dealer-primary",
    label: "Primär dealer · Meshy v001",
    limitations: [
      "5 klipp i paketet + 2 separat återfunna; deal, reveal och payout saknas",
      "Visuell dom: generiska Meshy-klipp är testmaterial, inte godkända dealerposer",
      "24 ben; fingerben, ögonben och ansiktsformer saknas",
      "Material fixat för labb; rotskala 0,01 återstår",
    ],
    modelUrl: "/models/lab-imports/dealer/dealer-primary-v001-candidate-a.glb",
    roleLabel: "Dealer",
    targetHeightM: 1.68,
  },
  {
    animationUrls: [
      "/models/lab-imports/woman/clips/woman-v001-clip-idle_11-armature.glb",
      "/models/lab-imports/woman/clips/woman-v001-clip-listening_gesture-armature.glb",
    ],
    fileSize: 26_137_392,
    id: "woman",
    label: "Kvinna i svart klänning · Meshy v001",
    limitations: [
      "5 klipp i paketet + 2 reparerade klipp laddas separat",
      "Underkänd animation: Idle_11 ger Dracula-pose och arm-/handkollisioner",
      "24 ben; fingerben, ögonben och ansiktsformer saknas",
      "Material fixat för labb; rotskala 0,01 återstår",
    ],
    modelUrl: "/models/lab-imports/woman/woman-v001-candidate-a.glb",
    roleLabel: "Värdinna / alternativ dealer",
    targetHeightM: 1.7,
  },
  {
    animationUrls: [
      "/models/lab-imports/patric/clips/patric-v001-clip-idle_11-armature.glb",
    ],
    fileSize: 42_883_024,
    id: "patric",
    label: "Patric · Meshy v001",
    limitations: [
      "6 klipp i paketet + separat återfunnen Idle_11",
      "Visuell dom: generiska gång-/idleklipp är endast testmaterial",
      "24 ben; fingerben, ögonben och ansiktsformer saknas",
      "Material fixat för labb; rotskala 0,01 återstår",
    ],
    modelUrl: "/models/lab-imports/patric/patric-v001-candidate-a.glb",
    roleLabel: "Spelare / testkaraktär",
    targetHeightM: 1.78,
  },
] as const satisfies readonly LabAsset[];

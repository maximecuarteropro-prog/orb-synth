import { RoundedBox } from '@react-three/drei'

/**
 * Socle de l'instrument : boîte sombre mate aux arêtes adoucies,
 * style objet de design premium, avec un liseré métallique discret.
 */
export default function Pedestal() {
  return (
    <group>
      {/* Corps du socle — dessus à y = 0 */}
      <RoundedBox args={[9, 0.9, 4.6]} radius={0.08} smoothness={4} position={[0, -0.45, 0]}>
        <meshStandardMaterial color="#1b1917" roughness={0.85} metalness={0.15} />
      </RoundedBox>
      {/* Liseré métallique à la base */}
      <RoundedBox args={[9.06, 0.06, 4.66]} radius={0.03} smoothness={4} position={[0, -0.86, 0]}>
        <meshStandardMaterial color="#3a332c" roughness={0.35} metalness={0.9} />
      </RoundedBox>
      {/* Plaque supérieure légèrement satinée */}
      <RoundedBox args={[8.9, 0.04, 4.5]} radius={0.02} smoothness={4} position={[0, 0.02, 0]}>
        <meshStandardMaterial color="#141210" roughness={0.55} metalness={0.4} />
      </RoundedBox>
    </group>
  )
}

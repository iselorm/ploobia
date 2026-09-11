import { useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import Prop from './Prop'
import { boardTexture, stripesTexture } from './textures'

/**
 * The stalls either side: onions, yam and plantain, each with its own board.
 * One verb — stall/compare — tapping a neighbour's board tells you what they
 * are asking, which is the whole reason a market is a place to learn about
 * price and not just a shop.
 */

export interface Neighbour {
  id: 'onions' | 'yam' | 'plantain'
  name: string
  eyebrow: string
  price: string
  small?: string
}

export const NEIGHBOURS: Neighbour[] = [
  { id: 'onions', name: 'Onions', eyebrow: 'onions · each', price: '₵3.50' },
  { id: 'yam', name: 'Yam', eyebrow: 'yam · tuber', price: '₵12' },
  { id: 'plantain', name: 'Plantain', eyebrow: 'plantain · hand', price: '₵15' },
]

function Table({ x, z, rot }: { x: number; z: number; rot: number }) {
  const stripes = useMemo(() => stripesTexture(), [])
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.83, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.06, 0.8]} />
        <meshStandardMaterial color="#8A5A2B" roughness={0.85} />
      </mesh>
      {[-0.68, 0.68].map((lx) => (
        <mesh key={lx} position={[lx, 0.4, -0.3]}>
          <boxGeometry args={[0.06, 0.8, 0.06]} />
          <meshStandardMaterial color="#6E4521" roughness={0.9} />
        </mesh>
      ))}
      {[-0.76, 0.76].map((lx) => (
        <mesh key={lx} position={[lx, 1.25, -0.4]}>
          <cylinderGeometry args={[0.022, 0.022, 2.5, 8]} />
          <meshStandardMaterial color="#C9A46B" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 2.36, 0.05]} rotation={[-0.32, 0, 0]}>
        <planeGeometry args={[1.9, 1.0]} />
        <meshStandardMaterial map={stripes} side={THREE.DoubleSide} roughness={0.95} />
      </mesh>
    </group>
  )
}

function Board({ n, position, onTap }: { n: Neighbour; position: [number, number, number]; onTap: (n: Neighbour) => void }) {
  const tex = useMemo(() => boardTexture(n.eyebrow, n.price, n.small), [n])
  return (
    <group position={position}>
      <mesh
        position={[0, 0.2, 0]}
        rotation={[-0.15, 0, 0]}
        name={`board-${n.id}`}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onTap(n)
        }}
      >
        <planeGeometry args={[0.3, 0.24]} />
        <meshBasicMaterial map={tex.texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

export default function Neighbours({ onCompare }: { onCompare: (n: Neighbour) => void }) {
  return (
    <group name="neighbours">
      {/* left, a little behind */}
      <Table x={-3.1} z={-0.9} rot={0.18} />
      <group position={[-3.1, 0.86, -0.9]} rotation={[0, 0.18, 0]}>
        <Prop id="onions" position={[-0.35, 0, 0.05]}>
          <mesh position={[0, 0.16, 0]} castShadow>
            <sphereGeometry args={[0.2, 14, 10]} />
            <meshStandardMaterial color="#8E4E6B" roughness={0.7} />
          </mesh>
        </Prop>
        <Board n={NEIGHBOURS[0]} position={[0.45, 0, -0.2]} onTap={onCompare} />
      </group>
      {/* right, further along the alley */}
      <Table x={3.3} z={-1.2} rot={-0.22} />
      <group position={[3.3, 0.86, -1.2]} rotation={[0, -0.22, 0]}>
        <Prop id="yam" position={[-0.4, 0, 0.05]} rotation={[0, 0.5, 0]}>
          <mesh position={[0, 0.1, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <capsuleGeometry args={[0.09, 0.32, 6, 10]} />
            <meshStandardMaterial color="#7A5A38" roughness={0.95} />
          </mesh>
        </Prop>
        <Prop id="plantain" position={[0.15, 0, 0.12]} rotation={[0, -0.6, 0]}>
          <mesh position={[0, 0.07, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <capsuleGeometry args={[0.06, 0.3, 6, 10]} />
            <meshStandardMaterial color="#6E9A3C" roughness={0.6} />
          </mesh>
        </Prop>
        <Board n={NEIGHBOURS[1]} position={[0.5, 0, -0.2]} onTap={onCompare} />
      </group>
    </group>
  )
}

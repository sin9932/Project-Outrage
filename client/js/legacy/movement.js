// movement.js (core-only split): pathfinding + formation offsets
// Loaded BEFORE game.js. game.js will call window.MovementInstall(...) if present.
(function(){
  window.MovementInstall = function(deps){
    const MAP_W = deps.MAP_W|0;
    const MAP_H = deps.MAP_H|0;
    const inMap = deps.inMap;
    const isWalkableTile = deps.isWalkableTile;

    function buildFormationOffsets(maxN){
        // Spiral in manhattan rings: 0, then 4, then 8...
        const out=[{dx:0,dy:0}];
        let r=1;
        while (out.length<maxN){
          // diamond ring: (r,0)->(0,r)->(-r,0)->(0,-r)
          for (let dx=-r; dx<=r; dx++){
            const dy = r - Math.abs(dx);
            out.push({dx,dy});
            if (dy!==0) out.push({dx,dy:-dy});
            if (out.length>=maxN) return out;
          }
          r++;
          if (r>64) break;
        }
        return out;
      }

    function aStarPath(sx,sy,gx,gy, maxNodes=12000){
        if (!inMap(sx,sy) || !inMap(gx,gy)) return null;
        if (!isWalkableTile(gx,gy)) return null;

        const W=MAP_W, H=MAP_H;
        const N=W*H;

        const open = new Int32Array(N);
        let openN=0;

        const inOpen = new Uint8Array(N);
        const closed = new Uint8Array(N);
        const gScore = new Int32Array(N);
        const fScore = new Int32Array(N);
        const came = new Int32Array(N);

        for (let i=0;i<N;i++){ gScore[i]=1e9; fScore[i]=1e9; came[i]=-1; }

        const s = sy*W+sx;
        const g = gy*W+gx;

        gScore[s]=0;
        fScore[s]=heuristic(sx,sy,gx,gy);
        open[openN++]=s;
        inOpen[s]=1;

        const dirs = [
            [ 1, 0, 10],[-1, 0, 10],[ 0, 1, 10],[ 0,-1, 10],
            [ 1, 1, 14],[ 1,-1, 14],[-1, 1, 14],[-1,-1, 14],
          ];
        let nodes=0;

        while (openN>0 && nodes<maxNodes){
          nodes++;

          let bestI=0;
          let bestF=fScore[open[0]];
          for (let i=1;i<openN;i++){
            const n=open[i];
            const f=fScore[n];
            if (f<bestF){ bestF=f; bestI=i; }
          }
          const cur = open[bestI];
          open[bestI]=open[--openN];
          inOpen[cur]=0;

          if (cur===g) break;
          closed[cur]=1;

          const cx=cur%W, cy=(cur/W)|0;

          for (const [dx,dy,cost] of dirs){
            const nx=cx+dx, ny=cy+dy;
            if (!inMap(nx,ny)) continue;

            // Prevent "corner cutting" when moving diagonally past blocked tiles.
            if (dx!==0 && dy!==0){
              if (!isWalkableTile(cx+dx, cy) || !isWalkableTile(cx, cy+dy)) continue;
            }

            const ni=ny*W+nx;
            if (closed[ni]) continue;
            if (!isWalkableTile(nx,ny)) continue;

            const tent = gScore[cur] + cost;
            if (tent < gScore[ni]){
              came[ni]=cur;
              gScore[ni]=tent;
              fScore[ni]=tent + heuristic(nx,ny,gx,gy);
              if (!inOpen[ni]){
                open[openN++]=ni;
                inOpen[ni]=1;
                if (openN>=N-4) break;
              }
            }
          }
        }

        if (came[g]===-1 && g!==s) return null;

        const path=[];
        let cur=g;
        path.push(cur);
        while (cur!==s){
          cur=came[cur];
          if (cur===-1) break;
          path.push(cur);
        }
        path.reverse();

        const out=[];
        let last=-1;
        for (let i=0;i<path.length;i++){
          const n=path[i];
          if (n===last) continue;
          last=n;
          out.push({tx:n%W, ty:(n/W)|0});
        }
        return out;
      }

    function findPath(sx,sy,gx,gy){
      return aStarPath(sx,sy,gx,gy);
    }
    return { buildFormationOffsets, aStarPath, findPath };
  };
})(); 

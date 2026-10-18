#!/usr/bin/env bash
# Lance plusieurs essais de survie CPU en parallèle.
# Usage : scripts/dev/lot.sh JOURS TAILLE NOM1 'JSON1' NOM2 'JSON2' ...
jours=$1; taille=$2; shift 2
while [ $# -gt 1 ]; do
  nom=$1; json=$2; shift 2
  PAS=${PAS:-600} SAUVE=.survie/logs/$nom.bin npx tsx scripts/survie-cpu.ts "$jours" "$taille" "${GRAINE:-1}" "$json" > .survie/logs/$nom.log 2>&1 &
done
wait

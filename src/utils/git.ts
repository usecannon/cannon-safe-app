import LightningFS from '@isomorphic-git/lightning-fs'
import http from 'isomorphic-git/http/web'
import md5 from 'crypto-js/md5'
import memoize from 'just-memoize'
import { checkout, clone, fastForward, fetch, findRoot } from 'isomorphic-git'

const getFs = memoize((name: string) => new LightningFS(name).promises)
const getDir = memoize(
  (repo: string, ref: string) => `/${md5(repo)}-${md5(ref)}`
)

export async function init(repo: string, ref: string) {
  const fs = getFs('git-repositories')
  const dir = getDir(repo, ref)

  await _mkdirp(fs, dir)

  const cloned = await _isCloned(fs, dir)

  const baseOpts = {
    fs,
    http,
    dir,
    url: repo,
    ref,
    corsProxy: 'https://cors.isomorphic-git.org',
  }

  if (!cloned) {
    await clone({ ...baseOpts, singleBranch: true, depth: 1 })
  } else {
    await fetch({ ...baseOpts, singleBranch: true, depth: 1 })
    await checkout({ fs, dir, ref })
    await fastForward({ ...baseOpts, singleBranch: true })
  }
}

export async function readFile(repo: string, ref: string, filepath: string) {
  const fs = getFs('git-repositories')
  const dir = getDir(repo, ref)
  return (await fs.readFile(`${dir}/${filepath}`, 'utf8')) as string
}

async function _mkdirp(fs, dir: string) {
  try {
    await fs.mkdir(dir)
  } catch (err) {
    if (err.code === 'EEXIST') return
    throw err
  }
}

async function _isCloned(fs, dir: string) {
  try {
    await findRoot({
      fs,
      filepath: `${dir}/.git`,
    })
    return true
  } catch (err) {
    if (err.code === 'NotFoundError') return false
    throw err
  }
}